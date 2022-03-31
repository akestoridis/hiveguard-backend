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

const path = require('path');
const express = require('express');

const defaults = require('./defaults.json');

class WebServer {
  constructor(webDirectory, webIndexFile, config = {}) {
    this.webDirectory = webDirectory;
    this.webIndexFile = webIndexFile;

    this.webIPAddress = (
      config.webIPAddress || defaults.webIPAddress
    );
    this.webPortNumber = (
      config.webPortNumber || defaults.webPortNumber
    );

    this.app = express();
    this.app.use(express.static(this.webDirectory));

    this.app.get(
      '/*',
      (req, res) => {
        res.sendFile(path.join(this.webDirectory, this.webIndexFile));
      },
    );
  }

  start() {
    this.app.listen(
      this.webPortNumber,
      this.webIPAddress,
      () => {
        console.log(
          `Started a web server at ${this.webIPAddress}`
          + `:${this.webPortNumber}`,
        );
      },
    );
  }
}

module.exports = WebServer;
