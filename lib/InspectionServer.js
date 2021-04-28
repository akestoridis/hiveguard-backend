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
const nodemailer = require('nodemailer');
const {
  isValidWIDSSensorID,
  isValidHours,
  isValidAlertID,
} = require('./validations');
const defaults = require('./defaults.json');

class InspectionServer {
  constructor(config = {}) {
    this.inspectionIPAddress = (
      config.inspectionIPAddress || defaults.inspectionIPAddress
    );
    this.inspectionPortNumber = (
      config.inspectionPortNumber || defaults.inspectionPortNumber
    );
    this.inspectionDelay = (
      config.inspectionDelay || defaults.inspectionDelay
    );

    this.notificationCooldown = (
      config.notificationCooldown || defaults.notificationCooldown
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
        'GET, OPTIONS, PUT',
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

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SNDR_HOST,
      port: process.env.EMAIL_SNDR_PORT,
      secure: true,
      auth: {
        user: process.env.EMAIL_SNDR_ADDR,
        pass: process.env.EMAIL_SNDR_PASS,
      },
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
          'SELECT epoch_timestamp, cpu_percent '
          + 'FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'ORDER BY epoch_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, memory_percent '
          + 'FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'ORDER BY epoch_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, disk_percent '
          + 'FROM wids_utilization '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'ORDER BY epoch_timestamp',
          [
            req.params.id,
            req.query.hours,
          ],
        );
        res.json(
          result.rows.map(
            (row) => ({
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT DISTINCT srcaddr, dstaddr '
          + 'FROM wids_pairs '
          + 'WHERE panid=$1 '
          + 'AND latest>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2)',
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
            'SELECT epoch_timestamp, packet_counter '
            + 'FROM wids_packet_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
            + '- INTERVAL \'1 HOUR\' * $2) '
            + 'AND srcpanid=$3 AND srcshortaddr=$4 '
            + 'ORDER BY epoch_timestamp',
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
                x: parseFloat(row.epoch_timestamp) * 1000.0,
                y: row.packet_counter,
              }),
            ),
          );
        } else {
          const result = await this.pool.query(
            'SELECT epoch_timestamp, packet_counter '
            + 'FROM wids_packet_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
            + '- INTERVAL \'1 HOUR\' * $2) '
            + 'AND srcpanid=$3 AND srcshortaddr IS NULL '
            + 'ORDER BY epoch_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: parseFloat(row.epoch_timestamp) * 1000.0,
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
            'SELECT epoch_timestamp, byte_counter '
            + 'FROM wids_byte_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
            + '- INTERVAL \'1 HOUR\' * $2) '
            + 'AND srcpanid=$3 AND srcshortaddr=$4 '
            + 'ORDER BY epoch_timestamp',
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
                x: parseFloat(row.epoch_timestamp) * 1000.0,
                y: row.byte_counter,
              }),
            ),
          );
        } else {
          const result = await this.pool.query(
            'SELECT epoch_timestamp, byte_counter '
            + 'FROM wids_byte_counters '
            + 'WHERE wids_sensor_id=$1 '
            + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
            + '- INTERVAL \'1 HOUR\' * $2) '
            + 'AND srcpanid=$3 AND srcshortaddr IS NULL '
            + 'ORDER BY epoch_timestamp',
            [
              req.query.sensor,
              req.query.hours,
              req.query.srcpanid,
            ],
          );
          res.json(
            result.rows.map(
              (row) => ({
                x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, mac_seqnum '
          + 'FROM wids_mac_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY epoch_timestamp',
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
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, beacon_seqnum '
          + 'FROM wids_beacon_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY epoch_timestamp',
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
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, nwk_seqnum '
          + 'FROM wids_nwk_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY epoch_timestamp',
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
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, nwkaux_seqnum '
          + 'FROM wids_nwkaux_seqnums '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY epoch_timestamp',
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
              x: parseFloat(row.epoch_timestamp) * 1000.0,
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
          'SELECT epoch_timestamp, percentage '
          + 'FROM wids_battery_percentages '
          + 'WHERE wids_sensor_id=$1 '
          + 'AND epoch_timestamp>=EXTRACT(EPOCH FROM NOW() '
          + '- INTERVAL \'1 HOUR\' * $2) '
          + 'AND srcpanid=$3 AND srcshortaddr=$4 '
          + 'ORDER BY epoch_timestamp',
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
              x: parseFloat(row.epoch_timestamp) * 1000.0,
              y: row.percentage,
            }),
          ),
        );
      } catch (err) {
        next(err);
      }
    });

    this.app.get('/api/alerts', async (req, res, next) => {
      if (req.query.archived !== 'true' && req.query.archived !== 'false') {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT alert_id, message FROM nsm_alerts WHERE archived=$1'
          + 'ORDER BY alert_id DESC',
          [
            (req.query.archived === 'true'),
          ],
        );
        res.json(result.rows);
      } catch (err) {
        next(err);
      }
    });

    this.app.put('/api/alerts/:id', async (req, res, next) => {
      if (
        !isValidAlertID(req.params.id)
        || (req.body.archived !== true && req.body.archived !== false)
      ) {
        res.sendStatus(400);
        return;
      }

      try {
        const result = await this.pool.query(
          'SELECT * FROM nsm_alerts WHERE alert_id=$1',
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
          'UPDATE nsm_alerts SET archived=$1 WHERE alert_id=$2',
          [
            req.body.archived,
            req.params.id,
          ],
        );
        res.sendStatus(200);
      } catch (err) {
        next(err);
      }
    });

    this.sendNotification = async () => {
      try {
        if (process.env.EMAIL_SNDR_ADDR && process.env.EMAIL_RCVR_ADDR) {
          const currentEpochTimestamp = Math.floor(Date.now() / 1000.0);
          const selectResult = await this.pool.query(
            'SELECT alert_id, message FROM nsm_alerts '
            + 'WHERE notified=$1 '
            + 'ORDER BY alert_id DESC',
            [
              false,
            ],
          );
          let emailBody = '<ul>';
          selectResult.rows.forEach((row) => {
            emailBody += `<li><b>[${row.alert_id}]</b> ${row.message}</li>`;
          });
          if (emailBody !== '<ul>') {
            emailBody += '</ul>';
            await this.transporter.sendMail({
              from: process.env.EMAIL_SNDR_ADDR,
              to: process.env.EMAIL_RCVR_ADDR,
              subject: `[HiveGuard] Notification ${currentEpochTimestamp}`,
              html: emailBody,
            });
            const updatePromises = [];
            selectResult.rows.forEach((row) => {
              updatePromises.push(
                new Promise((resolve, reject) => {
                  this.pool.query(
                    'UPDATE nsm_alerts SET notified=$1 WHERE alert_id=$2',
                    [
                      true,
                      row.alert_id,
                    ],
                    (err, result) => {
                      if (err) {
                        reject(err);
                      } else {
                        resolve(result);
                      }
                    },
                  );
                }),
              );
            });
            if (updatePromises.length > 0) {
              await Promise.all(updatePromises);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    this.shouldNotify = (previousTimestamp, potentialTimestamp) => {
      if (!previousTimestamp) {
        return true;
      }
      const newTime = parseFloat(potentialTimestamp);
      const lastTime = parseFloat(previousTimestamp);
      if (newTime > lastTime + this.notificationCooldown) {
        return true;
      }
      return false;
    };

    this.processPotentialAlerts = async (potentialAlerts) => {
      try {
        const selectPromises = [];
        potentialAlerts.forEach((potentialAlert) => {
          selectPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT MAX(epoch_timestamp) '
                + 'FROM nsm_alerts '
                + 'WHERE message=$1',
                [
                  potentialAlert.message,
                ],
                (err, selectResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      selectResult,
                      alertID: potentialAlert.alertID,
                      message: potentialAlert.message,
                      epochTimestamp: potentialAlert.epochTimestamp,
                    });
                  }
                },
              );
            }),
          );
        });
        if (selectPromises.length > 0) {
          const promiseResults = await Promise.all(selectPromises);
          const insertPromises = [];
          promiseResults.forEach((promiseResult) => {
            if (
              promiseResult.selectResult.rows.length === 1
              && this.shouldNotify(
                promiseResult.selectResult.rows[0].max,
                promiseResult.epochTimestamp,
              )
            ) {
              insertPromises.push(
                new Promise((resolve, reject) => {
                  this.pool.query(
                    'INSERT INTO nsm_alerts (alert_id, message, '
                    + 'epoch_timestamp, archived, notified) '
                    + 'VALUES ($1, $2, $3, $4, $5)',
                    [
                      promiseResult.alertID,
                      promiseResult.message,
                      promiseResult.epochTimestamp,
                      false,
                      false,
                    ],
                    (err, insertResult) => {
                      if (err) {
                        reject(err);
                      } else {
                        resolve(insertResult);
                      }
                    },
                  );
                }),
              );
            }
          });
          if (insertPromises.length > 0) {
            await Promise.all(insertPromises);
            this.sendNotification();
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    this.inspectEvents = async () => {
      try {
        const currentEpochTimestamp = Math.floor(Date.now() / 1000.0);
        const selectResult = await this.pool.query(
          'SELECT row_id, wids_sensor_id, epoch_timestamp, description '
          + 'FROM wids_events '
          + 'WHERE inspected=$1 '
          + 'ORDER BY epoch_timestamp',
          [
            false,
          ],
        );
        const updatePromises = [];
        for (let i = 0; i < selectResult.rows.length; i += 1) {
          const alertID = `HG${currentEpochTimestamp}E${i}`;
          const message = (
            `The WIDS sensor with ID ${selectResult.rows[i].wids_sensor_id} `
            + `detected the following: ${selectResult.rows[i].description}`
          );
          const epochTimestamp = selectResult.rows[i].epoch_timestamp;
          updatePromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'UPDATE wids_events SET inspected=$1 WHERE row_id=$2',
                [
                  true,
                  selectResult.rows[i].row_id,
                ],
                (err, updateResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      updateResult,
                      alertID,
                      message,
                      epochTimestamp,
                    });
                  }
                },
              );
            }),
          );
        }
        if (updatePromises.length > 0) {
          const promiseResults = await Promise.all(updatePromises);
          const potentialAlerts = [];
          const uniqueMessages = new Set();
          promiseResults.forEach((promiseResult) => {
            if (!uniqueMessages.has(promiseResult.message)) {
              uniqueMessages.add(promiseResult.message);
              potentialAlerts.push({
                alertID: promiseResult.alertID,
                message: promiseResult.message,
                epochTimestamp: promiseResult.epochTimestamp,
              });
            }
          });
          this.processPotentialAlerts(potentialAlerts);
        }
      } catch (err) {
        console.error(err);
      }
    };

    this.inspectEventsPeriodically = () => {
      this.inspectEvents();
      setTimeout(this.inspectEventsPeriodically, this.inspectionDelay);
    };

    this.startInspectionRoutine = async () => {
      await this.sendNotification();
      this.inspectEventsPeriodically();
    };
  }

  start() {
    this.startInspectionRoutine();
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
