/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { LogLevel, writeLog } from "arbuscular";
import { createHmac } from "crypto";
import { EventEmitter } from "events";
import Http from "http";

const SECRET = "qwTPvt81";

export class StubPathfinderServer extends EventEmitter {

    /** @type {Http.Server} */
    #server;

    /** @type {string} */
    #contextPath;

    /** @type {number} */
    #port;

    constructor(setting) {
        super();

        this.#contextPath = setting.contextPath;
        this.#port = Number(new URL(this.#contextPath).port);

        this.#server = Http.createServer((request, response) => {
            writeLog(`Stub server received request ${request.method} ${request.url}.`);

            if(request.url == null) {
                this.handleNotFoundError(response);
                return;
            }
            if(request.url == "/auth/token") {
                this.handleAuthenticate(request, response).catch(error => {
                    this.handleUnauthorizedError(response, error.message);
                    this.emit("error", error);
                });
            }else if(request.url == "/2/events") {
                try {
                    this.handleAuthorization(request);
                }catch(error) {
                    this.handleForbiddenError(response, error.message);
                    this.emit("error", error);
                    return;
                }
                this.handleEvents(request, response).then(requestBody => {
                    this.emit("data", requestBody);
                }).catch(error => {
                    this.handleBadRequestError(response, error.message);
                    this.emit("error", error);
                });
            }else {
                this.handleNotFoundError(response);
                return;
            }
        });
    }

    start() {
        this.#server.on("listening", () => {
            writeLog(`StubPathfinderServer is listening on ${this.#port}.`);
            this.emit("listen");
        });
        this.#server.listen(this.#port);
    }

    /**
     * @param {Http.IncomingMessage} request 
     * @param {Http.ServerResponse} response 
     * @returns {Promise<object>}
     */
    async handleAuthenticate(request, response) {
        let authorization = request.headers.authorization;
        if(authorization == null) {
            throw new Error("The authorization header of the request is empty.");
        }
        if(!authorization.startsWith("Basic ")) {
            throw new Error(`The authorization header of the request is invalid. ${authorization}`);
        }
        authorization = authorization.substring("Basic ".length).trim();
        let credentials = Buffer.from(authorization, "base64").toString("utf8").split(":");
        if(credentials.length != 2) {
            throw new Error(`The authorization header of the request is invalid. ${authorization}`);
        }
        await this.retrieveRequest(request);
        let responseBody = {token_type: "Bearer", access_token: this.generateJwtToken()};
        this.handleJson(response, responseBody);
    }

    /**
     * @param {Http.IncomingMessage} request 
     */
    handleAuthorization(request) {
        let authorization = request.headers.authorization;
        if(authorization == null) {
            throw new Error("The authorization header of the request is empty.");
        }
        if(!authorization.startsWith("Bearer ")) {
            throw new Error(`The authorization header of the request is invalid. ${authorization}`);
        }
        authorization = authorization.substring("Bearer ".length).trim();
        this.verifyJwtToken(authorization);
    }

    /**
     * @param {Http.IncomingMessage} request 
     * @param {Http.ServerResponse} response 
     * @returns {Promise<object>}
     */
    async handleEvents(request, response) {
        let requestBody = await this.retrieveRequest(request);
        
        if(requestBody == null || typeof requestBody != "object") {
            throw new Error("Invalid request.");
        }
        if(request.headers["content-type"] == null) {
            throw new Error("Invalid request.");
        }else if(!request.headers["content-type"].startsWith("application/cloudevents+json")) {
            throw new Error("The Content-Type of the request is invalid.");
        }
        if(requestBody.type == null) {
            throw new Error("The type of the request is invalid.");
        }
        if(requestBody.type != "org.wbcsd.pathfinder.Contract.Request.v1" && 
            requestBody.type != "org.wbcsd.pathfinder.Contract.Reply.v1"
        ) {
            throw new Error("The value of the type property is invalid.");
        }
        if(requestBody.id == null) {
            throw new Error("The id of the request is invalid.");
        }
        if(requestBody.source == null) {
            throw new Error("The source of the request is invalid.");
        }

        writeLog(`REQUEST: \n${JSON.stringify(requestBody, null, 4)}.`, LogLevel.debug);

        if(requestBody.type == "org.wbcsd.pathfinder.Contract.Request.v1") {
            this.emit("receiveContractRequest", requestBody);
            this.handleSuccess(response);
        }else if(requestBody.type == "org.wbcsd.pathfinder.Contract.Reply.v1") {
            this.emit("receiveContractReply", requestBody);
            this.handleSuccess(response);
        }
        return requestBody;
    }

    /**
     * @param {Http.ServerResponse} response 
     */
    handleSuccess(response) {
        writeLog(`The stub server returned a success response.`);
        response.writeHead(200);
        response.write("OK");
        response.end();
    }

    /**
     * @param {Http.ServerResponse} response 
     * @param {object} responseBody
     */
    handleJson(response, responseBody) {
        writeLog(`The stub server returned a success response.}`);
        writeLog(`RESPONSE:\n${JSON.stringify(responseBody, null, 4)}`, LogLevel.debug);
        responseBody = JSON.stringify(responseBody); 
        response.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(responseBody, "utf8")
        });
        response.write(responseBody);
        response.end();
    }

    /**
     * @param {Http.ServerResponse} response 
     * @param {string} message
     */
    handleBadRequestError(response, message) {
        /** @type {object|string} */
        let responseBody = {
            code: "BadRequest",
            message: message
        };
        writeLog(`The stub server returned an error response.`);
        writeLog(`RESPONSE:\n${JSON.stringify(responseBody, null, 4)}`, LogLevel.debug);
        responseBody = JSON.stringify(responseBody);
        response.writeHead(400, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(responseBody, "utf8")
        });
        response.write(responseBody);
        response.end();
    }

    /**
     * @param {Http.ServerResponse} response 
     * @param {string} message
     */
    handleForbiddenError(response, message) {
        /** @type {object|string} */
        let responseBody = {
            code: "AccessDenied",
            message: message
        };
        writeLog(`The stub server returned an error response.`);
        writeLog(`RESPONSE:\n${JSON.stringify(responseBody, null, 4)}`, LogLevel.debug);
        responseBody = JSON.stringify(responseBody);
        response.writeHead(403, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(responseBody, "utf8")
        });
        response.write(responseBody);
        response.end();
    }

    /**
     * @param {Http.ServerResponse} response 
     * @param {string} message
     */
    handleUnauthorizedError(response, message) {
        let responseBody = message;
        writeLog(`The stub server returned an error response.`);
        writeLog(`RESPONSE:${responseBody}}`, LogLevel.debug);
        response.writeHead(401, {
            "content-type": "text/plain",
            "content-length": Buffer.byteLength(responseBody, "utf8")
        });
        response.write(responseBody);
        response.end();
    }

    /**
     * @param {Http.ServerResponse} response 
     */
    handleNotFoundError(response) {
        let responseBody = "Not Found";
        writeLog(`The stub server returned an error response.`);
        writeLog(`RESPONSE:${responseBody}}`, LogLevel.debug);
        response.writeHead(404, {
            "content-type": "text/plain",
            "content-length": Buffer.byteLength(responseBody, "utf8")
        });
        response.write(responseBody);
        response.end();
    }

    /**
     * @param {Http.IncomingMessage} request 
     * @returns {Promise<any>}
     */
    async retrieveRequest(request) {
        return new Promise((resolve, reject) => {
            let buffer;
            request.on("data", chunk => {
                if(buffer == null) {
                    buffer = chunk;
                }else {
                    if(buffer instanceof Buffer) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }else if(typeof buffer == "string") {
                        buffer += chunk;
                    }
                }
            });
            request.on("end", () => {
                let requestBody = buffer;
                if(requestBody != null && request.headers["content-type"] != null) {
                    let contentType = request.headers["content-type"];
                    if(contentType.startsWith("application/json") || contentType.startsWith("application/cloudevents+json")) {
                        if(requestBody instanceof Buffer) {
                            requestBody = JSON.parse(requestBody.toString("utf8"));
                        }else if(typeof requestBody == "string") {
                            requestBody = JSON.parse(requestBody);
                        }
                    }
                }
                resolve(requestBody);
            });
            request.on("error", error => {
                reject(error);
            })
        });
    }

    /**
     * @returns {string}
     */
    generateJwtToken() {
        let header = {
            typ: "JWT",
            alg: "HS256"
        };
        let now = Math.floor(new Date().getTime()/1000);
        let claim = {
            iss: now,
            exp: now + 60*60
        };
        let token = Buffer.from(JSON.stringify(header)).toString("base64").replace(/=+$/, "")+"."+Buffer.from(JSON.stringify(claim)).toString("base64").replace(/=+$/, "");
        return token+"."+createHmac("sha256", SECRET).update(token).digest("base64").replace(/=+$/, "");
    }

    /**
     * @param {string} token 
     */
    verifyJwtToken(token) {
        let elements = token.split(".");
        if(elements.length != 3) {
            throw new Error("Invalid token");
        }
        let header = JSON.parse(Buffer.from(elements[0], "base64").toString());
        let claim = JSON.parse(Buffer.from(elements[1], "base64").toString());
        let certificate = elements[2];
        if(header.typ != "JWT" || header.alg != "HS256") {
            throw new Error("Invalid token");
        }
        if(typeof claim.iss != "number" || typeof claim.exp != "number") {
            throw new Error("Invalid token");
        }
        if(claim.exp < new Date().getTime()/1000) {
            throw new Error("Invalid token");
        }
        let _token = Buffer.from(JSON.stringify(header)).toString("base64").replace(/=+$/, "")+"."+Buffer.from(JSON.stringify(claim)).toString("base64").replace(/=+$/, "");
        let _certificate = createHmac("sha256", SECRET).update(_token).digest("base64").replace(/=+$/, "");
        if(_certificate != certificate) {
            throw new Error("Invalid token");
        }
    }
}