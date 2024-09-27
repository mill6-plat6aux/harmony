/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { readFileSync } from "fs";
import { createInterface } from "readline";
import { constants, createHash, createSign, privateDecrypt, publicEncrypt } from "crypto";
import { v4 as uuid } from "uuid";
import { request } from "../utility/http.js";
import { formatToIso8601String } from "../utility/date-utils.js";
import { StubPathfinderServer } from "./stub.js";
import assert from "assert";

const ContextPath = "http://localhost:8080";

const StubContextPaths = {
    demo1: "http://host.docker.internal:3201",
    demo2: "http://host.docker.internal:3202",
    demo3: "http://host.docker.internal:3203",
};

const HarmonyKeyPair = {
    privateKey: readFileSync("credentials/private-key.pem", "utf8").trim(),
    publicKey: readFileSync("credentials/public-key.pem", "utf8").trim()
};

const KeyPairs = {
    demo1: {
        privateKey: readFileSync("test/credentials/demo1/private-key.pem", "utf8").trim(),
        publicKey: readFileSync("test/credentials/demo1/public-key.pem", "utf8").trim()
    },
    demo2: {
        privateKey: readFileSync("test/credentials/demo2/private-key.pem", "utf8").trim(),
        publicKey: readFileSync("test/credentials/demo2/public-key.pem", "utf8").trim()
    },
    demo3: {
        privateKey: readFileSync("test/credentials/demo3/private-key.pem", "utf8").trim(),
        publicKey: readFileSync("test/credentials/demo3/public-key.pem", "utf8").trim()
    }
};

const HarmonyAccounts = {
    demo1: {
        userId: "user1@demo.a",
        password: "YJ.s;J3T"
    },
    demo2: {
        userId: "user1@demo.b",
        password: "g)4LOJ:q"
    },
    demo3: {
        userId: "user1@demo.c",
        password: "K.1<Nxuy"
    }
};

const HarmonyClientAccounts = {
    demo1: {
        userId: "user2@demo.a",
        password: "V8a![J51"
    },
    demo2: {
        userId: "user2@demo.b",
        password: "yRBz62e>"
    },
    demo3: {
        userId: "user2@demo.c",
        password: "nzTlz|)0"
    }
};

const PathfinderAccounts = {
    demo1: {
        demo2: {
            userId: "user3@demo.a",
            password: "kqJy)I6N"
        },
        demo3: {
            userId: "user4@demo.a",
            password: "=PI5#B{o"
        }
    },
    demo2: {
        demo3: {
            userId: "user3@demo.b",
            password: "6Q7Quv<D"
        },
        demo1: {
            userId: "user4@demo.b",
            password: "dCm$2gCT"
        }
    },
    demo3: {
        demo2: {
            userId: "user3@demo.c",
            password: "Bbup_Hn0"
        }
    }
};

const ConsoleStyle = {
    green: "\u001b[32m",
    red: "\u001b[31m",
    reset: "\u001b[0m"
};

let stubs = {};

let cli = createInterface({input: process.stdin, output: process.stdout});
cli.question(`Harmony must be running before the test can be run. 
Also, the database must have been created and database/demo.sql must be running. The test may destroy data. 
Enter [y] if all is complete: `, answer => {
    if(answer != "y") process.exit(0);

    let stub1 = new StubPathfinderServer({
        contextPath: StubContextPaths.demo1
    });
    let stub2 = new StubPathfinderServer({
        contextPath: StubContextPaths.demo2
    });
    let stub3 = new StubPathfinderServer({
        contextPath: StubContextPaths.demo3
    });
    stubs.demo1 = stub1;
    stubs.demo2 = stub2;
    stubs.demo3 = stub3;
    Promise.all([
        new Promise((resolve, reject) => {
            stub1.on("listen", () => {
                resolve(null);
            });
        }),
        new Promise((resolve, reject) => {
            stub2.on("listen", () => {
                resolve(null);
            });
        }),
        new Promise((resolve, reject) => {
            stub3.on("listen", () => {
                resolve(null);
            });
        })
    ]).then(() => {
        test().then(() => {
            process.exit(0);
        }).catch(error => {
            console.log(ConsoleStyle.red+"FAILED"+ConsoleStyle.reset);
            console.log(error.message);
            console.log(error.stack);
            process.exit(1);
        });
    }).catch(error => {
        console.log(ConsoleStyle.red+"FAILED"+ConsoleStyle.reset);
        console.log(error.message);
        console.log(error.stack);
        process.exit(1);
    });
    console.log("BS1");
    stubs.demo1.start();
    stubs.demo2.start();
    stubs.demo3.start();
});

async function test() {
    // TEST1: Authenticate
    let accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo1.userId, HarmonyAccounts.demo1.password);
    console.log("Authentication: "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

    // TEST2: Key pair update
    await requestToRemote("post", ContextPath+"/keypairs", accessToken, undefined, "application/json", {publicKey: KeyPairs.demo1.publicKey});
    await requestToRemote("delete", ContextPath+"/keypairs", accessToken);
    console.log("Public Key Update: "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

    // Recover the key pair
    await requestToRemote("post", ContextPath+"/keypairs", accessToken, undefined, "application/json", {publicKey: KeyPairs.demo1.publicKey});

    // TEST3: Data source update
    await requestToRemote("post", ContextPath+"/datasources", accessToken, KeyPairs.demo1.privateKey, "application/json", {
        userName: encrypt(HarmonyClientAccounts.demo1.userId, HarmonyKeyPair.publicKey),
        password: encrypt(HarmonyClientAccounts.demo1.password, HarmonyKeyPair.publicKey),
        endpoints: [
            {type: "Authenticate", url: encrypt(StubContextPaths.demo1+"/auth/token", HarmonyKeyPair.publicKey)},
            {type: "UpdateEvent", url: encrypt(StubContextPaths.demo1+"/2/events", HarmonyKeyPair.publicKey)}
        ]
    });
    await requestToRemote("delete", ContextPath+"/datasources", accessToken, KeyPairs.demo1.privateKey);
    console.log("Data Source Update: "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

    // Register a data source of Demo1
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo1.userId, HarmonyAccounts.demo1.password);
    await requestToRemote("post", ContextPath+"/datasources", accessToken, KeyPairs.demo1.privateKey, "application/json", {
        userName: encrypt(HarmonyClientAccounts.demo1.userId, HarmonyKeyPair.publicKey),
        password: encrypt(HarmonyClientAccounts.demo1.password, HarmonyKeyPair.publicKey),
        endpoints: [
            {type: "Authenticate", url: encrypt(StubContextPaths.demo1+"/auth/token", HarmonyKeyPair.publicKey)},
            {type: "UpdateEvent", url: encrypt(StubContextPaths.demo1+"/2/events", HarmonyKeyPair.publicKey)}
        ]
    });

    // Register a data source of Demo2
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo2.userId, HarmonyAccounts.demo2.password);
    await requestToRemote("post", ContextPath+"/datasources", accessToken, KeyPairs.demo2.privateKey, "application/json", {
        userName: encrypt(HarmonyClientAccounts.demo2.userId, HarmonyKeyPair.publicKey),
        password: encrypt(HarmonyClientAccounts.demo2.password, HarmonyKeyPair.publicKey),
        endpoints: [
            {type: "Authenticate", url: encrypt(StubContextPaths.demo2+"/auth/token", HarmonyKeyPair.publicKey)},
            {type: "UpdateEvent", url: encrypt(StubContextPaths.demo2+"/2/events", HarmonyKeyPair.publicKey)}
        ]
    });

    // Register a data source of Demo3
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo3.userId, HarmonyAccounts.demo3.password);
    await requestToRemote("post", ContextPath+"/datasources", accessToken, KeyPairs.demo3.privateKey, "application/json", {
        userName: encrypt(HarmonyClientAccounts.demo3.userId, HarmonyKeyPair.publicKey),
        password: encrypt(HarmonyClientAccounts.demo3.password, HarmonyKeyPair.publicKey),
        endpoints: [
            {type: "Authenticate", url: encrypt(StubContextPaths.demo3+"/auth/token", HarmonyKeyPair.publicKey)},
            {type: "UpdateEvent", url: encrypt(StubContextPaths.demo3+"/2/events", HarmonyKeyPair.publicKey)}
        ]
    });

    // TEST4: Company update notification

    // Register a company info of Demo1
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo1.userId, HarmonyAccounts.demo1.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo1.privateKey, "application/cloudevents+json", {
        id: uuid(),
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo1.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.Company.Updated.v1",
        data: {
            companyName: "Demo Company A",
            companyIds: ["urn:uuid:40d0eaa7-d9eb-4eab-ad56-dd4fddd725e6"]
        }
    });

    // Register a company info of Demo2
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo2.userId, HarmonyAccounts.demo2.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo2.privateKey, "application/cloudevents+json", {
        id: uuid(),
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo2.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.Company.Updated.v1",
        data: {
            companyName: "Demo Company B",
            companyIds: ["urn:uuid:61038ceb-15c9-43f7-a9bd-97a3ad2e34b5"]
        }
    });

    // Register a company info of Demo3
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo3.userId, HarmonyAccounts.demo3.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo3.privateKey, "application/cloudevents+json", {
        id: uuid(),
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo3.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.Company.Updated.v1",
        data: {
            companyName: "Demo Company C",
            companyIds: ["urn:uuid:e22fedcc-c3d7-4481-8f44-9d0ee0aa3d40"]
        }
    });

    console.log("Company Update Notification: "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

    // TEST5: Data source request & reply

    /**
     * @param {"demo1"|"demo2"|"demo3"} companyId 
     * @param {"demo1"|"demo2"|"demo3"} destinationCompanyId 
     * @param {string} eventId 
     * @param {string} eventSource 
     * @param {string} destinationPublicKey 
     * @param {string} companyName 
     * @param {Array<string>} companyIds 
     */
    async function replyContract(companyId, destinationCompanyId, eventId, eventSource, destinationPublicKey, companyName, companyIds) {
        let accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts[companyId].userId, HarmonyAccounts[companyId].password);
        await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs[companyId].privateKey, "application/cloudevents+json", {
            id: uuid(),
            specversion: "1.0",
            source: ContextPath.substring(StubContextPaths[companyId].indexOf(":")+1)+"/2/events",
            time: formatToIso8601String(new Date(), true),
            type: "org.wbcsd.pathfinder.Contract.Reply.v1",
            data: {
                requestEventId: eventId,
                requestSource: eventSource,
                dataSource: {
                    userName: encrypt(PathfinderAccounts[companyId][destinationCompanyId].userId, destinationPublicKey),
                    password: encrypt(PathfinderAccounts[companyId][destinationCompanyId].password, destinationPublicKey),
                    endpoints: [
                        {type: "Authenticate", url: encrypt(StubContextPaths[companyId]+"/auth/token", destinationPublicKey)},
                        {type: "GetFootprints", url: encrypt(StubContextPaths[companyId]+"/2/footprints", destinationPublicKey)},
                        {type: "UpdateEvent", url: encrypt(StubContextPaths[companyId]+"/2/events", destinationPublicKey)}
                    ]
                },
                companyName: companyName,
                companyIds: companyIds,
                message: "Reply Message"
            }
        });
    }

    let eventId = uuid();

    // Demo2 receives a request from Demo3
    stubs.demo2.once("receiveContractRequest", requestBody => {
        assert(requestBody.id == eventId);
        assert(requestBody.source == ContextPath.substring(StubContextPaths.demo3.indexOf(":")+1)+"/2/events");
        assert(requestBody.data != null);
        assert(requestBody.data.requestor != null);
        assert(requestBody.data.requestor.companyName == "Demo Company C");
        assert(requestBody.data.requestor.companyIds.length == 1 && requestBody.data.requestor.companyIds[0] == "urn:uuid:e22fedcc-c3d7-4481-8f44-9d0ee0aa3d40");
        assert(requestBody.data.requestor.publicKey != null);
        assert(requestBody.data.requestor.publicKey == KeyPairs.demo3.publicKey);
        assert(requestBody.data.requestee != null);
        assert(requestBody.data.requestee.companyName == "Demo Company B");
        assert(requestBody.data.requestee.companyIds.length == 1 && requestBody.data.requestee.companyIds[0] == "urn:uuid:61038ceb-15c9-43f7-a9bd-97a3ad2e34b5");
        assert(requestBody.data.message == "Request Message");
        console.log("Contract Request(1): "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

        // Responds to the requester.
        replyContract("demo2", "demo3", requestBody.id, requestBody.source, requestBody.data.requestor.publicKey, "Demo Company B", ["urn:uuid:61038ceb-15c9-43f7-a9bd-97a3ad2e34b5"]);
    });

    // Demo3 receives a reply from Demo2
    let promise = new Promise((resolve, reject) => {
        stubs.demo3.once("receiveContractReply", requestBody => {
            assert(requestBody.source == ContextPath.substring(StubContextPaths.demo2.indexOf(":")+1)+"/2/events");
            assert(requestBody.data != null);
            assert(requestBody.data.requestEventId == eventId);
            assert(requestBody.data.dataSource != null);
            assert(decrypt(requestBody.data.dataSource.userName, KeyPairs.demo3.privateKey) == PathfinderAccounts.demo2.demo3.userId, decrypt(requestBody.data.dataSource.userName, KeyPairs.demo3.privateKey) + "||||" + PathfinderAccounts.demo2.demo3.userId);
            assert(decrypt(requestBody.data.dataSource.password, KeyPairs.demo3.privateKey) == PathfinderAccounts.demo2.demo3.password);
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "Authenticate").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo2+"/auth/token");
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "GetFootprints").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo2+"/2/footprints");
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "UpdateEvent").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo2+"/2/events");
            assert(requestBody.data.companyName == "Demo Company B");
            assert(requestBody.data.companyIds.length == 1 && requestBody.data.companyIds[0] == "urn:uuid:61038ceb-15c9-43f7-a9bd-97a3ad2e34b5");
            assert(requestBody.data.message == "Reply Message");
            console.log("Contract Reply(1): "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

            resolve(null);
        });
    });

    // Demo3 requests a data source to Demo2
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo3.userId, HarmonyAccounts.demo3.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo3.privateKey, "application/cloudevents+json", {
        id: eventId,
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo3.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.Contract.Request.v1",
        data: {
            requestor: {
                companyName: "Demo Company C",
                companyIds: ["urn:uuid:e22fedcc-c3d7-4481-8f44-9d0ee0aa3d40"]
            },
            requestee: {
                companyName: "Demo Company B",
                companyIds: ["urn:uuid:61038ceb-15c9-43f7-a9bd-97a3ad2e34b5"]
            },
            message: "Request Message"
        }
    });

    await promise;

    // TEST6: Company update notification

    let pfId = uuid();

    // Register a PfId of Demo1
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo1.userId, HarmonyAccounts.demo1.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo1.privateKey, "application/cloudevents+json", {
        id: uuid(),
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo1.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.ProductFootprint.Updated.v1",
        data: {
            id: pfId,
            companyName: "Demo Company A",
            companyIds: ["urn:uuid:40d0eaa7-d9eb-4eab-ad56-dd4fddd725e6"],
            productIds: ["urn:uuid:7fa99a0e-2761-4939-b9c8-89b18bf18074"],
            productNameCompany: "Demo Product A1"
        }
    });
    console.log("Product Footprint Update Notification: "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

    // TEST7: Data source request with PfId & reply

    eventId = uuid();

    // Demo1 receives a request from Demo3
    stubs.demo1.once("receiveContractRequest", requestBody => {
        assert(requestBody.id == eventId);
        assert(requestBody.source == ContextPath.substring(StubContextPaths.demo3.indexOf(":")+1)+"/2/events");
        assert(requestBody.data != null);
        assert(requestBody.data.requestor != null);
        assert(requestBody.data.requestor.companyName == "Demo Company C");
        assert(requestBody.data.requestor.companyIds.length == 1 && requestBody.data.requestor.companyIds[0] == "urn:uuid:e22fedcc-c3d7-4481-8f44-9d0ee0aa3d40");
        assert(requestBody.data.requestor.publicKey != null);
        assert(requestBody.data.requestor.publicKey == KeyPairs.demo3.publicKey);
        assert(requestBody.data.requestee != null);
        assert(requestBody.data.requestee.id == pfId);
        assert(requestBody.data.message == "Request Message");
        console.log("Contract Request(2): "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

        // Responds to the requester.
        replyContract("demo1", "demo3", requestBody.id, requestBody.source, requestBody.data.requestor.publicKey, "Demo Company A", ["urn:uuid:40d0eaa7-d9eb-4eab-ad56-dd4fddd725e6"]);
    });

    promise = new Promise((resolve, reject) => {
        stubs.demo3.once("receiveContractReply", requestBody => {
            assert(requestBody.source == ContextPath.substring(StubContextPaths.demo1.indexOf(":")+1)+"/2/events");
            assert(requestBody.data != null);
            assert(requestBody.data.requestEventId == eventId);
            assert(requestBody.data.dataSource != null);
            assert(decrypt(requestBody.data.dataSource.userName, KeyPairs.demo3.privateKey) == PathfinderAccounts.demo1.demo3.userId);
            assert(decrypt(requestBody.data.dataSource.password, KeyPairs.demo3.privateKey) == PathfinderAccounts.demo1.demo3.password);
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "Authenticate").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo1+"/auth/token");
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "GetFootprints").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo1+"/2/footprints");
            assert(decrypt(requestBody.data.dataSource.endpoints.find(endpoint => endpoint.type == "UpdateEvent").url, KeyPairs.demo3.privateKey) == StubContextPaths.demo1+"/2/events");
            assert(requestBody.data.companyName == "Demo Company A");
            assert(requestBody.data.companyIds.length == 1 && requestBody.data.companyIds[0] == "urn:uuid:40d0eaa7-d9eb-4eab-ad56-dd4fddd725e6");
            assert(requestBody.data.message == "Reply Message");
            console.log("Contract Reply(2): "+ConsoleStyle.green+"PASS"+ConsoleStyle.reset);

            resolve(null);
        });
    });

    // Demo3 requests a data source to Demo2
    accessToken = await getAccessToken(ContextPath+"/auth/token", HarmonyAccounts.demo3.userId, HarmonyAccounts.demo3.password);
    await requestToRemote("post", ContextPath+"/events", accessToken, KeyPairs.demo3.privateKey, "application/cloudevents+json", {
        id: eventId,
        specversion: "1.0",
        source: ContextPath.substring(StubContextPaths.demo3.indexOf(":")+1)+"/2/events",
        time: formatToIso8601String(new Date(), true),
        type: "org.wbcsd.pathfinder.Contract.Request.v1",
        data: {
            requestor: {
                companyName: "Demo Company C",
                companyIds: ["urn:uuid:e22fedcc-c3d7-4481-8f44-9d0ee0aa3d40"]
            },
            requestee: {
                id: pfId
            },
            message: "Request Message"
        }
    });

    await promise;
}

/**
 * @param {string} url 
 * @param {string} userName 
 * @param {string} password 
 * @returns {Promise<string>}
 */
async function getAccessToken(url, userName, password) {
    let response = await request("post", url, {
        host: new URL(url).hostname,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(userName+":"+password).toString("base64")
    }, {grant_type: "client_credentials"});
    if(response.status != 200) {
        let message = response.body;
        if(message instanceof Buffer) {
            message = response.body.toString("utf8");
        }else if(typeof message == "object") {
            message = JSON.stringify(response.body);
        }
        throw new Error(`An error response was returned during authentication of the remote server. Status: ${response.status}, Body: ${message})}`);
    }
    if(response.body == null || response.body.access_token == null) {
        throw new Error(`Authentication on the remote server returned a successful response, but it did not contain an access token. Body: ${JSON.stringify(response.body)}`);
    }
    return response.body.access_token;
}

/**
 * @param {"get"|"post"|"patch"|"put"|"delete"|"option"|"head"} method 
 * @param {string} requestPath 
 * @param {string} accessToken 
 * @param {string} [privateKey] 
 * @param {string} [contentType] 
 * @param {object} [requestBody] 
 * @returns {Promise<object>}
 */
export async function requestToRemote(method, requestPath, accessToken, privateKey, contentType, requestBody) {
    let url = new URL(requestPath);

    let requestHeader = {
        host: url.hostname,
        authorization: "Bearer " + accessToken
    };

    if(contentType != null) {
        requestHeader["content-type"] = contentType;
    }

    if(privateKey != null) {
        let contentDigestLabel = "sha-256";
        let contentDigest;
        if(requestBody != null && typeof requestBody == "object") {
            contentDigest = createHash("SHA256").update(JSON.stringify(requestBody)).digest("base64");
        }
    
        let signLabel = "sig1";
        let signInput = `${signLabel}=("@method" "@authority" "@path"`;
        if(contentDigest != null) {
            signInput += ` "content-digest"`;
        }
        signInput += `);created=${new Date().getTime()};alg="rsa-v1_5-sha256"`;
        let signData = `"@method": ${method}\n"@authority": ${url.hostname}\n"@path": ${url.pathname}`;
        if(contentDigest != null) {
            signData += `\n"content-digest": ${contentDigestLabel}=:${contentDigest}:`;
        }
        let signature = createSign("SHA256").update(signData).end().sign(privateKey, "base64");

        Object.assign(requestHeader, {
            "content-digest": `${contentDigestLabel}=:${contentDigest}:`,
            "signature-input": signInput,
            "signature": `${signLabel}=:${signature}:`
        });
    }

    let response = await request(method, requestPath, requestHeader, requestBody);
    if(response.status != 200) {
        let message = response.body;
        if(message instanceof Buffer) {
            message = response.body.toString("utf8");
        }else if(typeof message == "object") {
            message = JSON.stringify(response.body);
        }
        throw new Error(`The remote server returned an error response. [${method}] ${requestPath} Status: ${response.status}, Body: ${message}`);
    }

    return response.body;
}

/**
 * @param {string} string 
 * @param {string} publicKey 
 * @returns {string}
 */
function encrypt(string, publicKey) {
    let encryptedData = publicEncrypt({key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING}, Buffer.from(string));
    return Buffer.from(encryptedData).toString("base64");
}

/**
 * @param {string} string 
 * @param {string} privateKey 
 * @returns {string}
 */
function decrypt(string, privateKey) {
    let encryptedData = Buffer.from(string, "base64");
    let decryptedData = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING }, encryptedData);
    return decryptedData.toString();
}