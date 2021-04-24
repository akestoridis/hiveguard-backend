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
          'SELECT utc_timestamp, cpu_percent FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.cpu_percent,
            }),
          ),
        );
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
          'SELECT utc_timestamp, memory_percent FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.memory_percent,
            }),
          ),
        );
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
          'SELECT utc_timestamp, disk_percent FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'ORDER BY utc_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.disk_percent,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/nearby-networks', async (req, res, next) => {
      try {
        const panidResult = await this.pool.query(
          'SELECT DISTINCT panid FROM wids_networks ORDER BY panid',
        );
        const nearbyNetworks = await Promise.all(
          panidResult.rows.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT DISTINCT epidset FROM wids_networks '
                + 'WHERE panid=$1 AND epidset!=$2',
                [
                  row.panid,
                  '',
                ],
                (err, epidResult) => {
                  if (err) {
                    reject(err);
                  } else if (epidResult.rows.length === 0) {
                    resolve({
                      panid: row.panid,
                      epid: 'Unknown',
                    });
                  } else if (epidResult.rows.length === 1) {
                    if (epidResult.rows[0].epidset.includes(';')) {
                      resolve({
                        panid: row.panid,
                        epid: 'Conflicting Data',
                      });
                    } else {
                      resolve({
                        panid: row.panid,
                        epid: epidResult.rows[0].epidset,
                      });
                    }
                  } else {
                    resolve({
                      panid: row.panid,
                      epid: 'Conflicting Data',
                    });
                  }
                },
              );
            }),
          ),
        );
        res.json(nearbyNetworks);
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/pan-identifiers', async (req, res, next) => {
      try {
        const result = await this.pool.query(
          'SELECT DISTINCT panid FROM wids_networks ORDER BY panid',
        );
        res.json(Array.from(result.rows, (row) => row.panid));
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/topology/:id', async (req, res, next) => {
      if (!isValidHours(req.query.hours)) {
        res.sendStatus(400);
        return;
      }

      try {
        const shortAddrResult = await this.pool.query(
          'SELECT DISTINCT shortaddr FROM wids_short_addresses '
          + 'WHERE panid=$1 ORDER BY shortaddr',
          [
            req.params.id,
          ],
        );
        const tableRows = await Promise.all(
          shortAddrResult.rows.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT DISTINCT altset, nwkset FROM wids_short_addresses '
                + 'WHERE panid=$1 AND shortaddr=$2',
                [
                  req.params.id,
                  row.shortaddr,
                ],
                (err, setsResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    let extendedaddr = '';
                    let nwkdevtype = '';
                    if (setsResult.rows.length === 0) {
                      extendedaddr = 'Unknown';
                      nwkdevtype = 'Unknown';
                    } else if (setsResult.rows.length === 1) {
                      if (setsResult.rows[0].altset === '') {
                        extendedaddr = 'Unknown';
                      } else if (setsResult.rows[0].altset.includes(';')) {
                        extendedaddr = 'Conflicting Data';
                      } else {
                        extendedaddr = setsResult.rows[0].altset;
                      }
                      if (setsResult.rows[0].nwkset === '') {
                        nwkdevtype = 'Unknown';
                      } else if (setsResult.rows[0].nwkset.includes(';')) {
                        nwkdevtype = 'Conflicting Data';
                      } else {
                        nwkdevtype = setsResult.rows[0].nwkset;
                      }
                    } else {
                      const extendedaddrSet = new Set();
                      const nwkdevtypeSet = new Set();
                      setsResult.rows.forEach((element) => {
                        if (element.altset !== '') {
                          extendedaddrSet.add(element.altset);
                        }
                        if (element.nwkset !== '') {
                          nwkdevtypeSet.add(element.nwkset);
                        }
                      });
                      if (extendedaddrSet.size === 0) {
                        extendedaddr = 'Unknown';
                      } else if (extendedaddrSet.size === 1) {
                        // eslint-disable-next-line prefer-destructuring
                        extendedaddr = Array.from(extendedaddrSet)[0];
                        if (extendedaddr.includes(';')) {
                          extendedaddr = 'Conflicting Data';
                        }
                      } else {
                        extendedaddr = 'Conflicting Data';
                      }
                      if (nwkdevtypeSet.size === 0) {
                        nwkdevtype = 'Unknown';
                      } else if (nwkdevtypeSet.size === 1) {
                        // eslint-disable-next-line prefer-destructuring
                        nwkdevtype = Array.from(nwkdevtypeSet)[0];
                        if (nwkdevtype.includes(';')) {
                          nwkdevtype = 'Conflicting Data';
                        }
                      } else {
                        nwkdevtype = 'Conflicting Data';
                      }
                    }
                    resolve({
                      shortaddr: row.shortaddr,
                      extendedaddr,
                      nwkdevtype,
                    });
                  }
                },
              );
            }),
          ),
        );
        const pairsResult = await this.pool.query(
          'SELECT DISTINCT srcaddr, dstaddr FROM wids_pairs '
          + 'WHERE panid=$1 AND latest>=NOW() - INTERVAL \'1 HOUR\' * $2',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        let graphDef = 'digraph {\n';
        tableRows.forEach((row) => {
          graphDef += `\t"${row.shortaddr}" [color=black `;
          if (row.nwkdevtype === 'Zigbee Coordinator') {
            graphDef += 'fillcolor="#FF0000" ';
          } else if (row.nwkdevtype === 'Zigbee Router') {
            graphDef += 'fillcolor="#FFA500" ';
          } else if (row.nwkdevtype === 'Zigbee End Device') {
            graphDef += 'fillcolor="#FFFF00" ';
          } else {
            graphDef += 'fillcolor="#FFFFFF" ';
          }
          graphDef += 'fontname="DejaVu Sans Mono" style=filled]\n';
        });
        pairsResult.rows.forEach((row) => {
          graphDef += `\t"${row.srcaddr}" -> "${row.dstaddr}"\n`;
        });
        graphDef += '}\n';
        res.json({
          table: tableRows,
          graph: graphDef,
        });
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/short-addresses', async (req, res, next) => {
      try {
        const result = await this.pool.query(
          'SELECT DISTINCT shortaddr FROM wids_short_addresses '
          + 'WHERE panid=$1 ORDER BY shortaddr',
          [
            req.query.panid,
          ],
        );
        res.json(Array.from(result.rows, (row) => row.shortaddr));
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/packet-counters', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        if (req.query.srcshortaddr) {
          const result = await this.pool.query(
            'SELECT utc_timestamp, packet_counter FROM wids_packet_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
            + 'AND srcpanid=$3 AND srcshortaddr=$4 '
            + 'ORDER BY utc_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
              req.query.srcshortaddr,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: row.utc_timestamp,
                y: row.packet_counter,
              }),
            ),
          );
        } else {
          const result = await this.pool.query(
            'SELECT utc_timestamp, packet_counter FROM wids_packet_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
            + 'AND srcpanid=$3 AND srcshortaddr IS NULL '
            + 'ORDER BY utc_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: row.utc_timestamp,
                y: row.packet_counter,
              }),
            ),
          );
        }
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/byte-counters', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        if (req.query.srcshortaddr) {
          const result = await this.pool.query(
            'SELECT utc_timestamp, byte_counter FROM wids_byte_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
            + 'AND srcpanid=$3 AND srcshortaddr=$4 '
            + 'ORDER BY utc_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
              req.query.srcshortaddr,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: row.utc_timestamp,
                y: row.byte_counter,
              }),
            ),
          );
        } else {
          const result = await this.pool.query(
            'SELECT utc_timestamp, byte_counter FROM wids_byte_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
            + 'AND srcpanid=$3 AND srcshortaddr IS NULL '
            + 'ORDER BY utc_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: row.utc_timestamp,
                y: row.byte_counter,
              }),
            ),
          );
        }
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/mac-seqnum', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
        || !req.query.srcshortaddr
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, mac_seqnum FROM wids_mac_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY utc_timestamp',
          [
            req.query.sensor,
            req.query.hours,
            req.query.srcpanid,
            req.query.srcshortaddr,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.mac_seqnum,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/beacon-seqnum', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
        || !req.query.srcshortaddr
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, beacon_seqnum FROM wids_beacon_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY utc_timestamp',
          [
            req.query.sensor,
            req.query.hours,
            req.query.srcpanid,
            req.query.srcshortaddr,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.beacon_seqnum,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/nwk-seqnum', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
        || !req.query.srcshortaddr
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, nwk_seqnum FROM wids_nwk_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY utc_timestamp',
          [
            req.query.sensor,
            req.query.hours,
            req.query.srcpanid,
            req.query.srcshortaddr,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.nwk_seqnum,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/nwkaux-seqnum', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
        || !req.query.srcshortaddr
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, nwkaux_seqnum FROM wids_nwkaux_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY utc_timestamp',
          [
            req.query.sensor,
            req.query.hours,
            req.query.srcpanid,
            req.query.srcshortaddr,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.nwkaux_seqnum,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/battery-percentages', async (req, res, next) => {
      if (
        !isValidWIDSSensorID(req.query.sensor)
        || !isValidHours(req.query.hours)
        || !req.query.srcpanid
        || !req.query.srcshortaddr
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT utc_timestamp, percentage FROM wids_battery_percentages '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND utc_timestamp>=NOW() - INTERVAL \'1 HOUR\' * $2 '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY utc_timestamp',
          [
            req.query.sensor,
            req.query.hours,
            req.query.srcpanid,
            req.query.srcshortaddr,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: row.utc_timestamp,
              y: row.percentage,
            }),
          ),
        );
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
