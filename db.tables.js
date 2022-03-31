#!/usr/bin/env node

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

require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const defaults = require('./lib/defaults.json');

const sqlStatements = {
  init: [
    'CREATE TABLE IF NOT EXISTS network_keys ('
    + 'key BYTEA UNIQUE NOT NULL, '
    + 'CHECK (OCTET_LENGTH(key) = 16))',
    'CREATE TABLE IF NOT EXISTS link_keys ('
    + 'key BYTEA UNIQUE NOT NULL, '
    + 'CHECK (OCTET_LENGTH(key) = 16))',
    'CREATE TABLE IF NOT EXISTS wids_sensors ('
    + 'wids_sensor_id  VARCHAR(127) UNIQUE NOT NULL, '
    + 'wids_sensor_api VARCHAR(127) UNIQUE NOT NULL)',
    'CREATE TABLE IF NOT EXISTS wids_utilization ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'cpu_percent     REAL NOT NULL, '
    + 'memory_percent  REAL NOT NULL, '
    + 'disk_percent    REAL NOT NULL, '
    + 'CHECK (cpu_percent >= 0.0), '
    + 'CHECK (cpu_percent <= 100.0), '
    + 'CHECK (memory_percent >= 0.0), '
    + 'CHECK (memory_percent <= 100.0), '
    + 'CHECK (disk_percent >= 0.0), '
    + 'CHECK (disk_percent <= 100.0))',
    'CREATE TABLE IF NOT EXISTS wids_networks ('
    + 'wids_sensor_id VARCHAR(127) NOT NULL, '
    + 'panid          VARCHAR(6) NOT NULL, '
    + 'epidset        VARCHAR(127) NOT NULL, '
    + 'earliest       NUMERIC(16, 6), '
    + 'latest         NUMERIC(16, 6))',
    'CREATE TABLE IF NOT EXISTS wids_short_addresses ('
    + 'wids_sensor_id VARCHAR(127) NOT NULL, '
    + 'panid          VARCHAR(6) NOT NULL, '
    + 'shortaddr      VARCHAR(6) NOT NULL, '
    + 'altset         VARCHAR(127) NOT NULL, '
    + 'macset         VARCHAR(127) NOT NULL, '
    + 'nwkset         VARCHAR(127) NOT NULL, '
    + 'earliest       NUMERIC(16, 6), '
    + 'latest         NUMERIC(16, 6))',
    'CREATE TABLE IF NOT EXISTS wids_extended_addresses ('
    + 'wids_sensor_id VARCHAR(127) NOT NULL, '
    + 'extendedaddr   VARCHAR(18) NOT NULL, '
    + 'altset         VARCHAR(127) NOT NULL, '
    + 'macset         VARCHAR(127) NOT NULL, '
    + 'nwkset         VARCHAR(127) NOT NULL, '
    + 'earliest       NUMERIC(16, 6), '
    + 'latest         NUMERIC(16, 6))',
    'CREATE TABLE IF NOT EXISTS wids_pairs ('
    + 'wids_sensor_id VARCHAR(127) NOT NULL, '
    + 'panid          VARCHAR(6) NOT NULL, '
    + 'srcaddr        VARCHAR(6) NOT NULL, '
    + 'dstaddr        VARCHAR(6) NOT NULL, '
    + 'earliest       NUMERIC(16, 6) NOT NULL, '
    + 'latest         NUMERIC(16, 6) NOT NULL)',
    'CREATE TABLE IF NOT EXISTS wids_packet_counters ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6), '
    + 'packet_counter  INTEGER NOT NULL, '
    + 'CHECK (packet_counter >= 0))',
    'CREATE TABLE IF NOT EXISTS wids_byte_counters ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6), '
    + 'byte_counter    INTEGER NOT NULL, '
    + 'CHECK (byte_counter >= 0))',
    'CREATE TABLE IF NOT EXISTS wids_mac_seqnums ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6) NOT NULL, '
    + 'mac_seqnum      INTEGER NOT NULL, '
    + 'CHECK (mac_seqnum >= 0), '
    + 'CHECK (mac_seqnum <= 255))',
    'CREATE TABLE IF NOT EXISTS wids_beacon_seqnums ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6) NOT NULL, '
    + 'beacon_seqnum   INTEGER NOT NULL, '
    + 'CHECK (beacon_seqnum >= 0), '
    + 'CHECK (beacon_seqnum <= 255))',
    'CREATE TABLE IF NOT EXISTS wids_nwk_seqnums ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6) NOT NULL, '
    + 'nwk_seqnum      INTEGER NOT NULL, '
    + 'CHECK (nwk_seqnum >= 0), '
    + 'CHECK (nwk_seqnum <= 255))',
    'CREATE TABLE IF NOT EXISTS wids_nwkaux_seqnums ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6) NOT NULL, '
    + 'nwkaux_seqnum   INTEGER NOT NULL, '
    + 'CHECK (nwkaux_seqnum >= 0), '
    + 'CHECK (nwkaux_seqnum <= 4294967295))',
    'CREATE TABLE IF NOT EXISTS wids_battery_percentages ('
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'srcpanid        VARCHAR(6) NOT NULL, '
    + 'srcshortaddr    VARCHAR(6) NOT NULL, '
    + 'percentage      REAL NOT NULL, '
    + 'CHECK (percentage >= 0.0), '
    + 'CHECK (percentage <= 100.0))',
    'CREATE TABLE IF NOT EXISTS wids_events ('
    + 'row_id          SERIAL PRIMARY KEY, '
    + 'wids_sensor_id  VARCHAR(127) NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'description     TEXT NOT NULL, '
    + 'inspected       BOOLEAN NOT NULL)',
    'CREATE TABLE IF NOT EXISTS nsm_alerts ('
    + 'alert_id        TEXT UNIQUE NOT NULL, '
    + 'message         TEXT NOT NULL, '
    + 'epoch_timestamp NUMERIC(16, 6) NOT NULL, '
    + 'archived        BOOLEAN NOT NULL, '
    + 'notified        BOOLEAN NOT NULL)',
  ],
  clean: [
    'DROP TABLE IF EXISTS network_keys',
    'DROP TABLE IF EXISTS link_keys',
    'DROP TABLE IF EXISTS wids_sensors',
    'DROP TABLE IF EXISTS wids_utilization',
    'DROP TABLE IF EXISTS wids_networks',
    'DROP TABLE IF EXISTS wids_short_addresses',
    'DROP TABLE IF EXISTS wids_extended_addresses',
    'DROP TABLE IF EXISTS wids_pairs',
    'DROP TABLE IF EXISTS wids_packet_counters',
    'DROP TABLE IF EXISTS wids_byte_counters',
    'DROP TABLE IF EXISTS wids_mac_seqnums',
    'DROP TABLE IF EXISTS wids_beacon_seqnums',
    'DROP TABLE IF EXISTS wids_nwk_seqnums',
    'DROP TABLE IF EXISTS wids_nwkaux_seqnums',
    'DROP TABLE IF EXISTS wids_battery_percentages',
    'DROP TABLE IF EXISTS wids_events',
    'DROP TABLE IF EXISTS nsm_alerts',
  ],
};

async function executeSqlStatements(arrayKey, config = {}) {
  const pool = new Pool(
    {
      host: config.databaseIPAddress || defaults.databaseIPAddress,
      port: config.databasePortNumber || defaults.databasePortNumber,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
    },
  );
  try {
    if (!Object.prototype.hasOwnProperty.call(sqlStatements, arrayKey)) {
      throw new Error('Unknown key for an array of SQL statements');
    }
    await Promise.all(
      sqlStatements[arrayKey].map(
        (sqlStatement) => new Promise(
          (resolve, reject) => {
            pool.query(
              sqlStatement,
              (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              },
            );
          },
        ),
      ),
    );
  } finally {
    await pool.end();
  }
}

(
  async () => {
    try {
      const args = process.argv.slice(2);
      switch (args.length) {
        case 1:
          await executeSqlStatements(args[0]);
          break;
        case 2:
          await executeSqlStatements(
            args[0],
            JSON.parse(fs.readFileSync(args[1])),
          );
          break;
        case 3:
          await executeSqlStatements(
            args[0],
            {
              databaseIPAddress: args[1],
              databasePortNumber: Number(args[2]),
            },
          );
          break;
        default:
          throw new Error('Invalid number of arguments');
      }
    } catch (err) {
      console.error(err);
      process.exitCode = 1;
    }
  }
)();
