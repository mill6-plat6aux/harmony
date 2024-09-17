/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { connection } from "../utility/database.js";
import { ErrorResponse, ErrorCode, writeError } from "arbuscular";

/**
 * @param {number} organizationId 
 * @param {string} organizationName 
 * @param {Array<string>} identifiers
 * @returns {Promise}
 */
export async function updateOrganization(organizationId, organizationName, identifiers) {
    let transaction = await connection.transaction();
    try {
        let records = await transaction.select("organizationName").from("Organization").where({OrganizationId: organizationId});
        if(records.length == 0) {
            throw ErrorResponse(ErrorCode.StateError, JSON.stringify({code: "AccessDenied", message: "Invalid access."}));
        }
        let record = records[0];
        if(organizationName != record.organizationName) {
            await transaction("Organization").update({
                OrganizationName: organizationName
            }).where({OrganizationId: organizationId});
        }
        let organizationIdentifiers = convertIdentifiers(identifiers);
        if(organizationIdentifiers.length == 0) {
            writeError(`The company identifier in the request could not be interpreted. [${JSON.stringify(identifiers)}]`);
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The companyIds does not contain a recognizable URN."}));
        }
        await transaction("OrganizationIdentifier").delete().where({OrganizationId: organizationId});
        await Promise.all(organizationIdentifiers.map(async organizationIdentifier => {
            await transaction.insert({
                OrganizationId: organizationId,
                Code: organizationIdentifier.code,
                Type: organizationIdentifier.type
            }).into("OrganizationIdentifier");
        }));
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @typedef {object} Organization
 * @property {number} organizationId
 * @property {string} publicKey
 */


/**
 * @param {number} organizationId 
 * @returns {Promise<Organization|null>}
 */
export async function getOrganization(organizationId) {
    let organizations = await connection.select("organizationId", "publicKey").from("Organization").where({OrganizationId: organizationId});
    if(organizations.length != 1) return null;
    let organization = organizations[0];
    if(organization.publicKey != null && organization.publicKey instanceof Buffer) {
        organization.publicKey = organization.publicKey.toString("utf8");
    }
    return organization;
}

/**
 * @param {string} organizationName 
 * @param {Array<string>} identifiers 
 * @returns {Promise<Array<Organization>>}
 */
export async function searchOrganization(organizationName, identifiers) {
    let organizations;
    if(identifiers != null && identifiers.length > 0) {
        let organizationIdentifiers = convertIdentifiers(identifiers);
        if(organizationIdentifiers.length == 0) {
            writeError(`The company identifier in the request could not be interpreted. [${JSON.stringify(identifiers)}]`);
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The companyIds does not contain a recognizable URN."}));
        }

        organizations = await connection.select("Organization.OrganizationId as organizationId", "publicKey")
            .from("OrganizationIdentifier")
            .leftJoin("Organization", "Organization.OrganizationId", "OrganizationIdentifier.OrganizationId")
            .where(function() {
                organizationIdentifiers.forEach((organizationIdentifier, index) => {
                    if(index == 0) {
                        this.where({Code: organizationIdentifier.code, Type: organizationIdentifier.type});
                    }else {
                        this.andWhere({Code: organizationIdentifier.code, Type: organizationIdentifier.type});
                    }
                });
            });
    }else if(organizationName != null && organizationName.length > 0) {
        organizations = await connection.select("organizationId", "publicKey").from("Organization")
            .where("OrganizationName", "like", "%"+organizationName+"%");
    }
    return organizations != null ? organizations : [];
}

/**
 * @param {Array<string>} identifiers 
 * @returns {Array<object>}
 */
function convertIdentifiers(identifiers) {
    return identifiers.map(identifier => {
        if(identifier.startsWith("urn:uuid:")) {
            return {type: "UUID", code: identifier.substring("urn:uuid:".length)};
        }else if(identifier.startsWith("urn:lei:")) {
            return {type: "LEI", code: identifier.substring("urn:lei:".length)};
        }else if(identifier.startsWith("urn:epc:id:sgln:")) {
            return {type: "SGLN", code: identifier.substring("urn:epc:id:sgln:".length)};
        }else if(identifier.startsWith("urn:pathfinder:company:customcode:vendor-assigned:")) {
            return {type: "SupplierSpecific", code: identifier.substring("urn:pathfinder:company:customcode:vendor-assigned:".length)};
        }else if(identifier.startsWith("urn:pathfinder:company:customcode:buyer-assigned:")) {
            return {type: "BuyerSpecific", code: identifier.substring("urn:pathfinder:company:customcode:buyer-assigned:".length)};
        }
        return null;
    }).filter(organizationIdentifier => organizationIdentifier != null);
}