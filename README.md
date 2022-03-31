<img src="https://github.com/akestoridis/hiveguard-backend/raw/b3e843eae53456554469997ce071f9696e5154ed/hiveguard-header.png">

# hiveguard-backend

Backend for HiveGuard


## Instructions

Currently, you can install the HiveGuard backend servers as follows:
```console
$ git clone https://github.com/akestoridis/hiveguard-backend.git
$ cd hiveguard-backend/
$ npm install
```

After setting your system's `DB_NAME`, `DB_USER`, and `DB_PASS` environment variables to the name of your database, your database username, and your database password respectively, you can initialize your database by running the `db:init` script with its IP address and port number, e.g.:
```console
$ npm run db:init 127.0.0.1 5432
```

Then, you can launch an individual HiveGuard backend server by running the script with the matching name, while also providing the path of a JSON file if you want to override the default configuration (which is defined in the `lib/defaults.json` file), e.g.:
```console
$ npm run retention config.prod.json
```

If you want the HiveGuard inspection server to send email notifications about generated alerts, you will have to set your system's `EMAIL_SNDR_HOST`, `EMAIL_SNDR_PORT`, `EMAIL_SNDR_ADDR`, `EMAIL_SNDR_PASS`, and `EMAIL_RCVR_ADDR` environment variables to the sender's email host, the sender's email port number, the sender's email address, the sender's email password, and the receiver's email address respectively.

During development, you can launch the HiveGuard inspection, aggregation, and retention servers with the default configuration by executing the following command:
```console
$ npm run start:dev
```


## Inspection REST API Endpoints

### `/api/wids-sensors`

Responds to HTTP GET requests with the list of currently registered WIDS sensor IDs and URLs.

### `/api/wids-sensors/:id/cpu`

Responds to HTTP GET requests with the CPU usage of the specified WIDS sensor since the amount of time that was specified with the `hours` query parameter.

### `/api/wids-sensors/:id/memory`

Responds to HTTP GET requests with the memory usage of the specified WIDS sensor since the amount of time that was specified with the `hours` query parameter.

### `/api/wids-sensors/:id/disk`

Responds to HTTP GET requests with the disk usage of the specified WIDS sensor since the amount of time that was specified with the `hours` query parameter.

### `/api/nearby-networks`

Responds to HTTP GET requests with the list of unique PAN IDs that have been aggregated and the matched Extended PAN IDs.

### `/api/pan-identifiers`

Responds to HTTP GET requests with the list of unique PAN IDs that have been aggregated.

### `/api/topology/:id`

Responds to HTTP GET requests with two objects that describe the topology of the network with the specified PAN ID. The first object corresponds to the list of that network's unique short addresses that have been aggregated, along with their matched extended addresses and inferred NWK-layer logical device types. The second object corresponds to a graph description, using the [DOT language](https://graphviz.org/doc/info/lang.html), with a node for each short address that is colored according to its inferred NWK-layer logical device type, while an edge between two nodes indicates that these nodes have exchanged MAC Data packets with their short addresses at least once since the amount of time that was specified with the `hours` query parameter.

### `/api/short-addresses`

Responds to HTTP GET requests with the list of unique short addresses that have been aggregated, with the `panid` query parameter specifying the PAN ID of their network.

### `/api/packet-counters`

Responds to HTTP GET requests with the number of new packets that were captured over time. The `sensor`, `srcpanid`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, and the desired time interval respectively. The `srcshortaddr` query parameter can be used to consider only the packets that were transmitted by a specified short address of the network, otherwise all the packets from that network will be considered.

### `/api/byte-counters`

Responds to HTTP GET requests with the number of new bytes that were captured over time. The `sensor`, `srcpanid`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, and the desired time interval respectively. The `srcshortaddr` query parameter can be used to consider only the bytes that were transmitted by a specified short address of the network, otherwise all the bytes from that network will be considered.

### `/api/mac-seqnum`

Responds to HTTP GET requests with the aggregated MAC sequence numbers over time. The `sensor`, `srcpanid`, `srcshortaddr`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, the source short address, and the desired time interval respectively.

### `/api/beacon-seqnum`

Responds to HTTP GET requests with the aggregated beacon sequence numbers over time. The `sensor`, `srcpanid`, `srcshortaddr`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, the source short address, and the desired time interval respectively.

### `/api/nwk-seqnum`

Responds to HTTP GET requests with the aggregated NWK sequence numbers over time. The `sensor`, `srcpanid`, `srcshortaddr`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, the source short address, and the desired time interval respectively.

### `/api/nwkaux-seqnum`

Responds to HTTP GET requests with the aggregated NWK auxiliary frame counters over time. The `sensor`, `srcpanid`, `srcshortaddr`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, the source short address, and the desired time interval respectively.

### `/api/battery-percentages`

Responds to HTTP GET requests with the aggregated remaining battery percentages over time. The `sensor`, `srcpanid`, `srcshortaddr`, and `hours` query parameters are used to specify the WIDS sensor ID, the source PAN ID, the source short address, and the desired time interval respectively.

### `/api/alerts`

Responds to HTTP GET requests with either the list of archived alerts or the list of unread alerts based on the provided value for the `archived` query parameter.

### `/api/alerts/:id`

Accepts HTTP PUT requests to update the state of the specified alert as either archived or unread based on the provided value for the `archived` query parameter.


## Aggregation REST API Endpoints

### `/api/registry`

Accepts HTTP POST requests to register a new WIDS sensor at a time.

### `/api/registry/:id`

Accepts HTTP DELETE requests to deregister an existing WIDS sensor at a time.


## Retention REST API Endpoints

### `/api/active-wids-sensors`

Responds to HTTP GET requests with the list of WIDS sensors from which files are currently being archived. This list can be updated through HTTP PUT requests.

### `/api/archived-files`

Responds to HTTP GET requests with the list of archived files that are currently available to download.

### `/api/archived-files/:folderName/:fileName`

Responds to HTTP GET requests with the specified archived file from the specified folder.


## Publication

HiveGuard was used in the following publication:

* D.-G. Akestoridis and P. Tague, “HiveGuard: A network security monitoring architecture for Zigbee networks,” to appear in Proc. IEEE CNS’21.


## Acknowledgments

This project was supported in part by the CyLab Security and Privacy Institute.


## License

Copyright 2021-2022 Dimitrios-Georgios Akestoridis

This project is licensed under the terms of the Apache License, Version 2.0 (Apache-2.0).
