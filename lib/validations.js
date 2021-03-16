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

const { URL } = require('url');

function isValidWIDSSensorID(potentialID) {
  if (
    !potentialID
    || typeof potentialID !== 'string'
    || !potentialID.match(/^[A-Za-z]{1}[0-9A-Za-z-._]{0,126}$/)
  ) {
    return false;
  }
  return true;
}

function isValidWIDSSensorAPI(potentialAPI) {
  if (
    !potentialAPI
    || typeof potentialAPI !== 'string'
    || potentialAPI.length < 1
    || potentialAPI.length > 127
    || potentialAPI.endsWith('/')
  ) {
    return false;
  }
  try {
    const urlObject = new URL(potentialAPI);
    if (urlObject.protocol !== 'http:') {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function isValidHours(potentialHours) {
  if (
    !potentialHours
    || typeof potentialHours !== 'string'
    || Number.isNaN(Number(potentialHours))
    || Number(potentialHours) <= 0.0
  ) {
    return false;
  }
  return true;
}

module.exports = {
  isValidWIDSSensorID,
  isValidWIDSSensorAPI,
  isValidHours,
};
