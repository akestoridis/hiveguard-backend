/*
 * Copyright 2021-2022 Dimitrios-Georgios Akestoridis
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const util = require('util');
const express = require('express');
const axios = require('axios');

const {
  isValidWIDSSensorID,
  isValidWIDSSensorAPI,
} = require('./validations');
const defaults = require('./defaults.json');

class RetentionServer {
  constructor(config = {}) {
    this.activeWIDSSensors = [];

    this.retentionIPAddress = (
      config.retentionIPAddress || defaults.retentionIPAddress
    );
    this.retentionPortNumber = (
      config.retentionPortNumber || defaults.retentionPortNumber
    );
    this.retentionDelay = (
      config.retentionDelay || defaults.retentionDelay
    );
    this.retentionDirectory = (
      config.retentionDirectory || defaults.retentionDirectory
    );

    this.readdir = util.promisify(fs.readdir);
    this.stat = util.promisify(fs.stat);

    this.app = express();
    this.app.use(express.json());
    this.app.use(
      (req, res, next) => {
        res.setHeader(
          'Access-Control-Allow-Origin',
          config.originURL || defaults.originURL,
        );
        next();
      },
    );

    this.getFolderObject = async (folderName) => {
      const folderPath = path.join(
        this.retentionDirectory,
        folderName,
      );
      const folderContents = await this.readdir(folderPath);
      const folderStats = await Promise.all(
        folderContents.map(
          (contentName) => this.stat(
            path.join(folderPath, contentName),
          ),
        ),
      );
      const fileNames = folderContents.filter(
        (contentName, i) => folderStats[i].isFile(),
      );
      return {
        folderName,
        fileNames,
      };
    };

    this.app.get(
      '/api/archived-files',
      async (req, res, next) => {
        try {
          const rootContents = await this.readdir(this.retentionDirectory);
          const rootStats = await Promise.all(
            rootContents.map(
              (contentName) => this.stat(
                path.join(this.retentionDirectory, contentName),
              ),
            ),
          );
          const folderNames = rootContents.filter(
            (contentName, i) => rootStats[i].isDirectory(),
          );
          const folderObjects = await Promise.all(
            folderNames.map(
              (folderName) => this.getFolderObject(folderName),
            ),
          );
          const archivedFiles = [];
          folderObjects.forEach(
            (folderObject) => {
              folderObject.fileNames.forEach(
                (fileName) => {
                  archivedFiles.push(
                    {
                      folderName: folderObject.folderName,
                      fileName,
                    },
                  );
                },
              );
            },
          );
          res.json(
            _.sortBy(archivedFiles, ['fileName', 'folderName']).reverse(),
          );
        } catch (err) {
          next(err);
        }
      },
    );

    this.app.get(
      '/api/archived-files/:folderName/:fileName',
      async (req, res, next) => {
        if (!isValidWIDSSensorID(req.params.folderName)) {
          res.sendStatus(400);
          return;
        }

        try {
          const filePath = path.join(
            this.retentionDirectory,
            req.params.folderName,
            req.params.fileName,
          );
          if (
            !fs.existsSync(filePath)
            || !fs.statSync(filePath).isFile()
          ) {
            res.sendStatus(404);
            return;
          }
          res.download(filePath);
        } catch (err) {
          next(err);
        }
      },
    );

    this.app.get(
      '/api/active-wids-sensors',
      async (req, res, next) => {
        try {
          res.json(this.activeWIDSSensors);
        } catch (err) {
          next(err);
        }
      },
    );

    this.app.put(
      '/api/active-wids-sensors',
      async (req, res, next) => {
        try {
          for (let i = 0; i < req.body.length; i += 1) {
            if (
              !isValidWIDSSensorID(req.body[i].wids_sensor_id)
              || !isValidWIDSSensorAPI(req.body[i].wids_sensor_api)
            ) {
              res.sendStatus(400);
              return;
            }
          }
          this.activeWIDSSensors = req.body;
          res.sendStatus(200);
        } catch (err) {
          next(err);
        }
      },
    );

    this.downloadPcapFile = async (url, filepath) => {
      try {
        const response = await axios.get(
          url,
          {
            responseType: 'arraybuffer',
          },
        );
        fs.writeFile(
          filepath,
          Buffer.from(response.data),
          (err) => {
            if (err) {
              throw err;
            }
          },
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.fetchPcapFiles = async (id, api) => {
      try {
        const pcapDirectory = path.join(this.retentionDirectory, id);
        if (!fs.existsSync(pcapDirectory)) {
          fs.mkdirSync(pcapDirectory);
        }
        const response = await axios.get(`${api}/pcap-files`);
        const newPcapFiles = response.data.filter(
          (basename) => !fs.readdirSync(pcapDirectory).includes(basename),
        );
        newPcapFiles.forEach(
          (basename) => {
            this.downloadPcapFile(
              `${api}/download/${basename}`,
              path.join(pcapDirectory, basename),
            );
          },
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.archivePcapFiles = async () => {
      await Promise.all(
        this.activeWIDSSensors.map(
          (row) => this.fetchPcapFiles(
            row.wids_sensor_id,
            row.wids_sensor_api,
          ),
        ),
      );
      setTimeout(this.archivePcapFiles, this.retentionDelay);
    };
  }

  start() {
    if (!fs.existsSync(this.retentionDirectory)) {
      fs.mkdirSync(this.retentionDirectory);
    }
    this.archivePcapFiles();
    this.app.listen(
      this.retentionPortNumber,
      this.retentionIPAddress,
      () => {
        console.log(
          `Started a retention server at ${this.retentionIPAddress}`
          + `:${this.retentionPortNumber}`,
        );
      },
    );
  }
}

module.exports = RetentionServer;
