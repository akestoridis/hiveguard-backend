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

CREATE TABLE wids_sensors_util (
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
