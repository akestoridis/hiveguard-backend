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

CREATE TABLE wids_sensors (
  wids_sensor_id  VARCHAR(127) UNIQUE NOT NULL,
  wids_sensor_api VARCHAR(127) UNIQUE NOT NULL
);

CREATE TABLE wids_utilization (
  wids_sensor_id VARCHAR(127) NOT NULL,
  utc_timestamp  TIMESTAMPTZ NOT NULL,
  cpu_percent    REAL NOT NULL,
  memory_percent REAL NOT NULL,
  disk_percent   REAL NOT NULL,
  CHECK (cpu_percent >= 0.0),
  CHECK (cpu_percent <= 100.0),
  CHECK (memory_percent >= 0.0),
  CHECK (memory_percent <= 100.0),
  CHECK (disk_percent >= 0.0),
  CHECK (disk_percent <= 100.0)
);

CREATE TABLE wids_networks (
  wids_sensor_id VARCHAR(127) NOT NULL,
  panid          VARCHAR(6) NOT NULL,
  epidset        VARCHAR(127) NOT NULL,
  earliest       TIMESTAMPTZ,
  latest         TIMESTAMPTZ
);

CREATE TABLE wids_short_addresses (
  wids_sensor_id VARCHAR(127) NOT NULL,
  panid          VARCHAR(6) NOT NULL,
  shortaddr      VARCHAR(6) NOT NULL,
  altset         VARCHAR(127) NOT NULL,
  macset         VARCHAR(127) NOT NULL,
  nwkset         VARCHAR(127) NOT NULL,
  earliest       TIMESTAMPTZ,
  latest         TIMESTAMPTZ
);

CREATE TABLE wids_extended_addresses (
  wids_sensor_id VARCHAR(127) NOT NULL,
  extendedaddr   VARCHAR(18) NOT NULL,
  altset         VARCHAR(127) NOT NULL,
  macset         VARCHAR(127) NOT NULL,
  nwkset         VARCHAR(127) NOT NULL,
  earliest       TIMESTAMPTZ,
  latest         TIMESTAMPTZ
);

CREATE TABLE wids_pairs (
  wids_sensor_id VARCHAR(127) NOT NULL,
  panid          VARCHAR(6) NOT NULL,
  srcaddr        VARCHAR(6) NOT NULL,
  dstaddr        VARCHAR(6) NOT NULL,
  earliest       TIMESTAMPTZ NOT NULL,
  latest         TIMESTAMPTZ NOT NULL
);

CREATE TABLE wids_packet_counters (
  wids_sensor_id VARCHAR(127) NOT NULL,
  utc_timestamp  TIMESTAMPTZ NOT NULL,
  srcpanid       VARCHAR(6) NOT NULL,
  srcshortaddr   VARCHAR(6),
  packet_counter INTEGER NOT NULL,
  CHECK (packet_counter >= 0)
);
