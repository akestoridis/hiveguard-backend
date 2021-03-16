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
const WebServer = require('./lib/WebServer');

const args = process.argv.slice(2);
if (args.length === 2) {
  const webServer = new WebServer(args[0], args[1]);
  webServer.start();
} else if (args.length === 3) {
  const config = JSON.parse(fs.readFileSync(args[2]));
  const webServer = new WebServer(args[0], args[1], config);
  webServer.start();
} else {
  throw new Error('Invalid number of arguments');
}
