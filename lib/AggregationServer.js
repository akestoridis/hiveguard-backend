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
    this.lastPacketCounters = {};
    this.lastByteCounters = {};
    this.lastMACSeqnums = {};
    this.lastBeaconSeqnums = {};
    this.lastNWKSeqnums = {};
    this.lastNWKAUXSeqnums = {};
    this.lastBtryPercs = {};

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

    this.insertBtryPercs = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastBtryPercs) {
          url += `?last=${this.lastBtryPercs[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastBtryPercs[id]
            || entry.epochTimestamp > this.lastBtryPercs[id]
          ) {
            this.lastBtryPercs[id] = entry.epochTimestamp;
          }
          insertPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'INSERT INTO wids_battery_percentages (wids_sensor_id, '
                + 'utc_timestamp, srcpanid, srcshortaddr, percentage) '
                + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
                [
                  id,
                  entry.epochTimestamp,
                  entry.srcpanid,
                  entry.srcshortaddr,
                  entry.batteryPercentage,
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
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateBtryPercsData = () => {
      this.widsSensors.forEach((row) => {
        this.insertBtryPercs(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/battery-percentages`,
        );
      });
      setTimeout(this.aggregateBtryPercsData, this.aggregationDelay);
    };

    this.insertNWKAUXSeqnums = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastNWKAUXSeqnums) {
          url += `?last=${this.lastNWKAUXSeqnums[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastNWKAUXSeqnums[id]
            || entry.epochTimestamp > this.lastNWKAUXSeqnums[id]
          ) {
            this.lastNWKAUXSeqnums[id] = entry.epochTimestamp;
          }
          insertPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'INSERT INTO wids_nwkaux_seqnums (wids_sensor_id, '
                + 'utc_timestamp, srcpanid, srcshortaddr, nwkaux_seqnum) '
                + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
                [
                  id,
                  entry.epochTimestamp,
                  entry.srcpanid,
                  entry.srcshortaddr,
                  entry.nwkauxSeqnum,
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
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateNWKAUXSeqnumsData = () => {
      this.widsSensors.forEach((row) => {
        this.insertNWKAUXSeqnums(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/nwkaux-seqnums`,
        );
      });
      setTimeout(this.aggregateNWKAUXSeqnumsData, this.aggregationDelay);
    };

    this.insertNWKSeqnums = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastNWKSeqnums) {
          url += `?last=${this.lastNWKSeqnums[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastNWKSeqnums[id]
            || entry.epochTimestamp > this.lastNWKSeqnums[id]
          ) {
            this.lastNWKSeqnums[id] = entry.epochTimestamp;
          }
          insertPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'INSERT INTO wids_nwk_seqnums (wids_sensor_id, '
                + 'utc_timestamp, srcpanid, srcshortaddr, nwk_seqnum) '
                + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
                [
                  id,
                  entry.epochTimestamp,
                  entry.srcpanid,
                  entry.srcshortaddr,
                  entry.nwkSeqnum,
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
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateNWKSeqnumsData = () => {
      this.widsSensors.forEach((row) => {
        this.insertNWKSeqnums(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/nwk-seqnums`,
        );
      });
      setTimeout(this.aggregateNWKSeqnumsData, this.aggregationDelay);
    };

    this.insertBeaconSeqnums = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastBeaconSeqnums) {
          url += `?last=${this.lastBeaconSeqnums[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastBeaconSeqnums[id]
            || entry.epochTimestamp > this.lastBeaconSeqnums[id]
          ) {
            this.lastBeaconSeqnums[id] = entry.epochTimestamp;
          }
          insertPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'INSERT INTO wids_beacon_seqnums (wids_sensor_id, '
                + 'utc_timestamp, srcpanid, srcshortaddr, beacon_seqnum) '
                + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
                [
                  id,
                  entry.epochTimestamp,
                  entry.srcpanid,
                  entry.srcshortaddr,
                  entry.beaconSeqnum,
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
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateBeaconSeqnumsData = () => {
      this.widsSensors.forEach((row) => {
        this.insertBeaconSeqnums(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/beacon-seqnums`,
        );
      });
      setTimeout(this.aggregateBeaconSeqnumsData, this.aggregationDelay);
    };

    this.insertMACSeqnums = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastMACSeqnums) {
          url += `?last=${this.lastMACSeqnums[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastMACSeqnums[id]
            || entry.epochTimestamp > this.lastMACSeqnums[id]
          ) {
            this.lastMACSeqnums[id] = entry.epochTimestamp;
          }
          insertPromises.push(
            new Promise((resolve, reject) => {
              this.pool.query(
                'INSERT INTO wids_mac_seqnums (wids_sensor_id, '
                + 'utc_timestamp, srcpanid, srcshortaddr, mac_seqnum) '
                + 'VALUES ($1, TO_TIMESTAMP($2), $3, $4, $5)',
                [
                  id,
                  entry.epochTimestamp,
                  entry.srcpanid,
                  entry.srcshortaddr,
                  entry.macSeqnum,
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
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateMACSeqnumsData = () => {
      this.widsSensors.forEach((row) => {
        this.insertMACSeqnums(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/mac-seqnums`,
        );
      });
      setTimeout(this.aggregateMACSeqnumsData, this.aggregationDelay);
    };

    this.insertByteCounterPromise = (
      widsSensorID,
      epochTimestamp,
      srcpanid,
      srcshortaddr,
      byteCounter,
    ) => (
      new Promise((resolve, reject) => {
        this.pool.query(
          'INSERT INTO wids_byte_counters (wids_sensor_id, utc_timestamp, '
          + 'srcpanid, srcshortaddr, byte_counter) VALUES ($1, '
          + 'TO_TIMESTAMP($2), $3, $4, $5)',
          [
            widsSensorID,
            epochTimestamp,
            srcpanid,
            srcshortaddr,
            byteCounter,
          ],
          (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          },
        );
      })
    );

    this.insertByteCounters = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastByteCounters) {
          url += `?last=${this.lastByteCounters[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastByteCounters[id]
            || entry.epochTimestamp > this.lastByteCounters[id]
          ) {
            this.lastByteCounters[id] = entry.epochTimestamp;
          }
          entry.panByteCounters.forEach((network) => {
            insertPromises.push(
              this.insertByteCounterPromise(
                id,
                entry.epochTimestamp,
                network.srcpanid,
                null,
                network.counter,
              ),
            );
            network.deviceByteCounters.forEach((device) => {
              insertPromises.push(
                this.insertByteCounterPromise(
                  id,
                  entry.epochTimestamp,
                  network.srcpanid,
                  device.srcshortaddr,
                  device.counter,
                ),
              );
            });
          });
        });
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateByteCountersData = () => {
      this.widsSensors.forEach((row) => {
        this.insertByteCounters(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/byte-counters`,
        );
      });
      setTimeout(this.aggregateByteCountersData, this.aggregationDelay);
    };

    this.insertPacketCounterPromise = (
      widsSensorID,
      epochTimestamp,
      srcpanid,
      srcshortaddr,
      packetCounter,
    ) => (
      new Promise((resolve, reject) => {
        this.pool.query(
          'INSERT INTO wids_packet_counters (wids_sensor_id, utc_timestamp, '
          + 'srcpanid, srcshortaddr, packet_counter) VALUES ($1, '
          + 'TO_TIMESTAMP($2), $3, $4, $5)',
          [
            widsSensorID,
            epochTimestamp,
            srcpanid,
            srcshortaddr,
            packetCounter,
          ],
          (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          },
        );
      })
    );

    this.insertPacketCounters = async (id, baseURL) => {
      try {
        let url = baseURL;
        if (id in this.lastPacketCounters) {
          url += `?last=${this.lastPacketCounters[id]}`;
        }
        const response = await axios.get(url);
        const insertPromises = [];
        response.data.forEach((entry) => {
          if (
            !this.lastPacketCounters[id]
            || entry.epochTimestamp > this.lastPacketCounters[id]
          ) {
            this.lastPacketCounters[id] = entry.epochTimestamp;
          }
          entry.panPacketCounters.forEach((network) => {
            insertPromises.push(
              this.insertPacketCounterPromise(
                id,
                entry.epochTimestamp,
                network.srcpanid,
                null,
                network.counter,
              ),
            );
            network.devicePacketCounters.forEach((device) => {
              insertPromises.push(
                this.insertPacketCounterPromise(
                  id,
                  entry.epochTimestamp,
                  network.srcpanid,
                  device.srcshortaddr,
                  device.counter,
                ),
              );
            });
          });
        });
        await Promise.all(insertPromises);
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregatePacketCountersData = () => {
      this.widsSensors.forEach((row) => {
        this.insertPacketCounters(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/packet-counters`,
        );
      });
      setTimeout(this.aggregatePacketCountersData, this.aggregationDelay);
    };

    this.insertPairsRow = async (widsSensorID, dataEntry) => {
      try {
        await this.pool.query(
          'INSERT INTO wids_pairs (wids_sensor_id, panid, srcaddr, dstaddr, '
          + 'earliest, latest) VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5), '
          + 'TO_TIMESTAMP($6))',
          [
            widsSensorID,
            dataEntry.panid,
            dataEntry.srcaddr,
            dataEntry.dstaddr,
            dataEntry.earliest,
            dataEntry.latest,
          ],
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.updatePairsData = async (widsSensorID, url) => {
      try {
        const response = await axios.get(url);
        await this.pool.query(
          'DELETE FROM wids_pairs WHERE wids_sensor_id=$1',
          [
            widsSensorID,
          ],
        );
        response.data.forEach((dataEntry) => {
          this.insertPairsRow(widsSensorID, dataEntry);
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregatePairsData = () => {
      this.widsSensors.forEach((row) => {
        this.updatePairsData(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/pairs`,
        );
      });
      setTimeout(this.aggregatePairsData, this.aggregationDelay);
    };

    this.insertExtendedAddressesRow = async (widsSensorID, dataEntry) => {
      try {
        await this.pool.query(
          'INSERT INTO wids_extended_addresses (wids_sensor_id, '
          + 'extendedaddr, altset, macset, nwkset, earliest, latest) VALUES '
          + '($1, $2, $3, $4, $5, TO_TIMESTAMP($6), TO_TIMESTAMP($7))',
          [
            widsSensorID,
            dataEntry.extendedaddr,
            dataEntry.altset,
            dataEntry.macset,
            dataEntry.nwkset,
            dataEntry.earliest,
            dataEntry.latest,
          ],
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.updateExtendedAddressesData = async (widsSensorID, url) => {
      try {
        const response = await axios.get(url);
        await this.pool.query(
          'DELETE FROM wids_extended_addresses WHERE wids_sensor_id=$1',
          [
            widsSensorID,
          ],
        );
        response.data.forEach((dataEntry) => {
          this.insertExtendedAddressesRow(widsSensorID, dataEntry);
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateExtendedAddressesData = () => {
      this.widsSensors.forEach((row) => {
        this.updateExtendedAddressesData(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/extended-addresses`,
        );
      });
      setTimeout(this.aggregateExtendedAddressesData, this.aggregationDelay);
    };

    this.insertShortAddressesRow = async (widsSensorID, dataEntry) => {
      try {
        await this.pool.query(
          'INSERT INTO wids_short_addresses (wids_sensor_id, panid, '
          + 'shortaddr, altset, macset, nwkset, earliest, latest) VALUES '
          + '($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7), TO_TIMESTAMP($8))',
          [
            widsSensorID,
            dataEntry.panid,
            dataEntry.shortaddr,
            dataEntry.altset,
            dataEntry.macset,
            dataEntry.nwkset,
            dataEntry.earliest,
            dataEntry.latest,
          ],
        );
      } catch (err) {
        console.error(err);
      }
    };

    this.updateShortAddressesData = async (widsSensorID, url) => {
      try {
        const response = await axios.get(url);
        await this.pool.query(
          'DELETE FROM wids_short_addresses WHERE wids_sensor_id=$1',
          [
            widsSensorID,
          ],
        );
        response.data.forEach((dataEntry) => {
          this.insertShortAddressesRow(widsSensorID, dataEntry);
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.aggregateShortAddressesData = () => {
      this.widsSensors.forEach((row) => {
        this.updateShortAddressesData(
          row.wids_sensor_id,
          `${row.wids_sensor_api}/short-addresses`,
        );
      });
      setTimeout(this.aggregateShortAddressesData, this.aggregationDelay);
    };

    this.insertNetworksRow = async (widsSensorID, dataEntry) => {
      try {
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
      } catch (err) {
        console.error(err);
      }
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
          'INSERT INTO wids_utilization (wids_sensor_id, utc_timestamp, '
          + 'cpu_percent, memory_percent, disk_percent) '
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
          `${row.wids_sensor_api}/utilization`,
        );
      });
      setTimeout(this.aggregateUtilData, this.aggregationDelay);
    };

    this.initLastBtryPercs = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_battery_percentages WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastBtryPercs[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastNWKAUXSeqnums = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_nwkaux_seqnums WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastNWKAUXSeqnums[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastNWKSeqnums = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_nwk_seqnums WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastNWKSeqnums[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastBeaconSeqnums = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_beacon_seqnums WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastBeaconSeqnums[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastMACSeqnums = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_mac_seqnums WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastMACSeqnums[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastByteCounters = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_byte_counters WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastByteCounters[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastPacketCounters = async () => {
      try {
        const maxTimestamps = await Promise.all(
          this.widsSensors.map(
            (row) => new Promise((resolve, reject) => {
              this.pool.query(
                'SELECT EXTRACT(EPOCH FROM MAX(utc_timestamp)) '
                + 'FROM wids_packet_counters WHERE wids_sensor_id=$1',
                [
                  row.wids_sensor_id,
                ],
                (err, extractResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      id: row.wids_sensor_id,
                      result: extractResult,
                    });
                  }
                },
              );
            }),
          ),
        );
        maxTimestamps.forEach((tmp) => {
          if (tmp.result.rows.length === 1 && tmp.result.rows[0].date_part) {
            this.lastPacketCounters[tmp.id] = tmp.result.rows[0].date_part;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    this.initLastTimestamps = async () => {
      await Promise.all([
        this.initLastPacketCounters(),
        this.initLastByteCounters(),
        this.initLastMACSeqnums(),
        this.initLastBeaconSeqnums(),
        this.initLastNWKSeqnums(),
        this.initLastNWKAUXSeqnums(),
        this.initLastBtryPercs(),
      ]);
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
      await this.initLastTimestamps();
      this.aggregateUtilData();
      this.aggregateNetworksData();
      this.aggregateShortAddressesData();
      this.aggregateExtendedAddressesData();
      this.aggregatePairsData();
      this.aggregatePacketCountersData();
      this.aggregateByteCountersData();
      this.aggregateMACSeqnumsData();
      this.aggregateBeaconSeqnumsData();
      this.aggregateNWKSeqnumsData();
      this.aggregateNWKAUXSeqnumsData();
      this.aggregateBtryPercsData();
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
