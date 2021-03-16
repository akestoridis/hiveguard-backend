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

const express = require('express');
const { Pool } = require('pg');
const { isValidWIDSSensorID, isValidHours } = require('./validations');
const defaults = require('./defaults.json');

class InspectionServer {
  constructor(config = {}) {
    this.inspectionIPAddress = (
      config.inspectionIPAddress || defaults.inspectionIPAddress
    );
    this.inspectionPortNumber = (
      config.inspectionPortNumber || defaults.inspectionPortNumber
    );

    this.app = express();
    this.app.use((req, res, next) => {
      res.setHeader(
        'Access-Control-Allow-Origin',
        config.originURL || defaults.originURL,
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

    this.app.get('/api/wids-sensors', async (req, res, next) => {
      try {
        const result = await this.pool.query(
          'SELECT wids_sensor_id, wids_sensor_api FROM wids_sensors '
          + 'ORDER BY wids_sensor_id',
        );
        res.json(result.rows);
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/wids-sensors/:id/cpu', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.params.id)
        || !isValidHours(req.query.hours)
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, cpu_percent FROM wids_sensors_util '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2'
            + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        if (result.rows.length === 0) {
          res.sendStatus(404);
          return;
        }
        const xDataArray = Array.from(result.rows, (x) => x.utc_timestamp);
        const yDataArray = Array.from(result.rows, (x) => x.cpu_percent);
        res.json({
          xData: xDataArray,
          yData: yDataArray,
        });
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/wids-sensors/:id/memory', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.params.id)
        || !isValidHours(req.query.hours)
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, memory_percent FROM wids_sensors_util '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2'
            + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        if (result.rows.length === 0) {
          res.sendStatus(404);
          return;
        }
        const xDataArray = Array.from(result.rows, (x) => x.utc_timestamp);
        const yDataArray = Array.from(result.rows, (x) => x.memory_percent);
        res.json({
          xData: xDataArray,
          yData: yDataArray,
        });
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/wids-sensors/:id/disk', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.params.id)
        || !isValidHours(req.query.hours)
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, disk_percent FROM wids_sensors_util '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2'
            + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        if (result.rows.length === 0) {
          res.sendStatus(404);
          return;
        }
        const xDataArray = Array.from(result.rows, (x) => x.utc_timestamp);
        const yDataArray = Array.from(result.rows, (x) => x.disk_percent);
        res.json({
          xData: xDataArray,
          yData: yDataArray,
        });
      } catch (err) {
        next(err);
      }
    });
  }

  start() {
    this.app.listen(
      this.inspectionPortNumber,
      this.inspectionIPAddress,
      () => {
        console.log(
          `Started an inspection server at ${this.inspectionIPAddress}`
          + `:${this.inspectionPortNumber}`,
        );
      },
    );
  }
}

module.exports = InspectionServer;
