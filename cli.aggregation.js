#!/usr/bin/env node

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

const fs = require('fs');
const AggregationServer = require('./lib/AggregationServer');

const args = process.argv.slice(2);
if (args.length === 0) {
  const aggregationServer = new AggregationServer();
  aggregationServer.start();
} else if (args.length === 1) {
  const config = JSON.parse(fs.readFileSync(args[0]));
  const aggregationServer = new AggregationServer(config);
  aggregationServer.start();
} else {
  throw new Error('Invalid number of arguments');
}
