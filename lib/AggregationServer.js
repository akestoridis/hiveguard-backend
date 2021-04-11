/*
 * Copyright 2021 Dimitrios-Georgios Akestoridis
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

require('dotenv').config();

const _ = require('lodash');
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const {
  isValidWIDSSensorID,
  isValidWIDSSensorAPI,
} = require('./validations');
const defaults = require('./defaults.json');

class AggregationServer {
  constructor(config = {}) {
    this.widsSensors = [];

    this.aggregationIPAddress = (
      config.aggregationIPAddress || defaults.aggregationIPAddress
    );
    this.aggregationPortNumber = (
      config.aggregationPortNumber || defaults.aggregationPortNumber
    );
    this.aggregationDelay = (
      config.aggregationDelay || defaults.aggregationDelay
    );

    this.retentionIPAddress = (
      config.retentionIPAddress || defaults.retentionIPAddress
    );
    this.retentionPortNumber = (
      config.retentionPortNumber || defaults.retentionPortNumber
    );

    this.app = express();
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.setHeader(
        'Access-Control-Allow-Origin',
        config.originURL || defaults.originURL,
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type',
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, OPTIONS, POST, DELETE',
      );
      next();
    });

    this.pool = new Pool({
      host: config.databaseIPAddress || defaults.databaseIPAddress,
      port: config.databasePortNumber || defaults.databasePortNumber,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
    });

    this.app.post('/api/registry', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.body.wids_sensor_id)
        || !isValidWIDSSensorAPI(req.body.wids_sensor_api)
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT * FROM wids_sensors '
          + 'WHERE wids_sensor_id=$1 OR wids_sensor_api=$2',
          [
            req.body.wids_sensor_id,
            req.body.wids_sensor_api,
          ],
        );
        if (result.rows.length !== 0) {
          res.sendStatus(400);
          return;
        }
        await this.pool.query(
          'INSERT INTO wids_sensors (wids_sensor_id, wids_sensor_api) '
          + 'VALUES ($1, $2)',
          [
            req.body.wids_sensor_id,
            req.body.wids_sensor_api,
          ],
        );
        res.sendStatus(200);
        this.updateCachedMetadata();
      } catch (err) {
        next(err);
      }
    });

    this.app.delete('/api/registry/:id', async (req, res, next) => {
      if (!isValidWIDSSensorID(req.params.id)) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT * FROM wids_sensors WHERE wids_sensor_id=$1',
          [
            req.params.id,
          ],
        );
        if (result.rows.length === 0) {
          res.sendStatus(404);
          return;
        }
        if (result.rows.length !== 1) {
          res.sendStatus(500);
          return;
        }
        await this.pool.query(
          'DELETE FROM wids_sensors WHERE wids_sensor_id=$1',
          [
            req.params.id,
          ],
        );
        res.sendStatus(200);
        this.updateCachedMetadata();
      } catch (err) {
        next(err);
      }
    });

    this.monitorRetentionMetadata = async () => {
      try {
        const retentionMetadataURL = (
          `http://${this.retentionIPAddress}:${this.retentionPortNumber}/api`
          + '/active-wids-sensors'
        );
        const response = await axios.get(retentionMetadataURL);
        if (!_.isEqual(response.data, this.widsSensors)) {
          await axios.put(retentionMetadataURL, this.widsSensors);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(this.monitorRetentionMetadata, this.aggregationDelay);
      }
    };

    this.insertNetworksRow = async (widsSensorID, dataEntry) => {
      await this.pool.query(
        'INSERT INTO wids_networks (wids_sensor_id, panid, epidset, '
        + 'earliest, latest) VALUES ($1, $2, $3, TO_TIMESTAMP($4), '
        + 'TO_TIMESTAMP($5))',
        [
          widsSensorID,
          dataEntry.panid,
          dataEntry.epidset,
          dataEntry.earliest,
          dataEntry.latest,
        ],
      );
    };

    this.updateNetworksData = async (widsSensorID, url) => {
      try {
        const response = await axios.get(url);
        await this.pool.query(
          'DELETE FROM wids_networks WHERE wids_sensor_id=$1',
          [
            widsSensorID,
          ],
        );
        response.data.forEach((dataEntry) => {
          this.insertNetworksRow(widsSensorID, dataEntry);
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateNetworksData = () => {
      this.widsSensors.forEach((row) => {
        this.updateNetworksData(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/networks`,
        );
      });
      setTimeout(this.aggregateNetworksData, this.aggregationDelay);
    };

    this.insertUtilMeasurements = async (id, url) => {
      try {
        const response = await axios.get(url);
        await this.pool.query(
          'INSERT INTO wids_sensors_util (wids_sensor_id, '
          + 'utc_timestamp, cpu_percent, memory_percent, disk_percent) '
          + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
          [
            id,
            response.data.epochTimestamp,
            response.data.cpuPercent,
            response.data.memoryPercent,
            response.data.diskPercent,
          ],
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateUtilData = () => {
      this.widsSensors.forEach((row) => {
        this.insertUtilMeasurements(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/util`,
        );
      });
      setTimeout(this.aggregateUtilData, this.aggregationDelay);
    };

    this.updateCachedMetadata = async () => {
      try {
        const result = await this.pool.query(
          'SELECT wids_sensor_id, wids_sensor_api FROM wids_sensors',
        );
        this.widsSensors = result.rows;
      } catch (err) {
        console.error(err);
      }
    };

    this.startAggregationRoutine = async () => {
      await this.updateCachedMetadata();
      this.aggregateUtilData();
      this.aggregateNetworksData();
      this.monitorRetentionMetadata();
    };
  }

  start() {
    this.startAggregationRoutine();
    this.app.listen(
      this.aggregationPortNumber,
      this.aggregationIPAddress,
      () => {
        console.log(
          `Started an aggregation server at ${this.aggregationIPAddress}`
          + `:${this.aggregationPortNumber}`,
        );
      },
    );
  }
}

module.exports = AggregationServer;
