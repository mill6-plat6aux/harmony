/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { connection } from "../utility/database.js";
import { ErrorResponse, ErrorCode, writeError } from "arbuscular";

/**
 * @param {number} organizationId 
 * @param {string} productName 
 * @param {Array<string>} identifiers
 * @returns {Promise<object>} 
 */
export async function updateProduct(organizationId, productName, identifiers) {
    let transaction = await connection.transaction();
    let productId;
    try {
        let records = await transaction.select("productId").from("Product").where({OrganizationId: organizationId, ProductName: productName});
        if(records.length == 0) {
            let ids = await transaction.insert({
                ProductName: productName,
                OrganizationId: organizationId
            }).into("Product");
            if(ids.length != 1) throw ErrorResponse(ErrorCode.StateError, "Inserting failed.");
            productId = ids[0];
        }else {
            let record = records[0];
            productId = record.productId;
        }
        let productIdentifiers = convertIdentifiers(identifiers);
        if(productIdentifiers.length == 0) {
            writeError(`The company identifier in the request could not be interpreted. [${JSON.stringify(identifiers)}]`);
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The companyIds does not contain a recognizable URN."}));
        }
        await transaction("ProductIdentifier").delete().where({ProductId: productId});
        await Promise.all(productIdentifiers.map(async productIdentifier => {
            await transaction.insert({
                ProductId: productId,
                Code: productIdentifier.code,
                Type: productIdentifier.type
            }).into("ProductIdentifier");
        }));
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
    return {productId: productId};
}

/**
 * @param {string} productName 
 * @param {Array<string>} identifiers 
 * @returns {Promise<Array<object>>}
 */
export async function searchOrganization(productName, identifiers) {
    let products;
    if(identifiers != null && identifiers.length > 0) {
        let productIdentifiers = convertIdentifiers(identifiers);
        if(productIdentifiers.length == 0) {
            writeError(`The company identifier in the request could not be interpreted. [${JSON.stringify(identifiers)}]`);
            throw ErrorResponse(ErrorCode.RequestError, JSON.stringify({code: "BadRequest", message: "The companyIds does not contain a recognizable URN."}));
        }

        products = await connection.select("Product.ProductId as productId")
            .from("ProductIdentifier")
            .leftJoin("Product", "Product.ProductId", "ProductIdentifier.ProductId")
            .where(function() {
                productIdentifiers.forEach((productIdentifier, index) => {
                    if(index == 0) {
                        this.where({Code: productIdentifier.code, Type: productIdentifier.type});
                    }else {
                        this.andWhere({Code: productIdentifier.code, Type: productIdentifier.type});
                    }
                });
            });
    }else if(productName != null && productName.length > 0) {
        products = await connection.select("productId").from("Product").where("ProductName", "like", "%"+productName+"%");
    }
    return products != null ? products : [];
}

/**
 * @param {Array<string>} identifiers 
 * @returns {Array<object>}
 */
export function convertIdentifiers(identifiers) {
    return identifiers.map(identifier => {
        if(identifier.startsWith("urn:uuid:")) {
            return {type: "UUID", code: identifier.substring("urn:uuid:".length)};
        }else if(identifier.startsWith("urn:epc:id:sgtin:")) {
            return {type: "SGTIN", code: identifier.substring("urn:epc:id:sgtin:".length)};
        }else if(identifier.startsWith("urn:pathfinder:product:customcode:vendor-assigned:")) {
            return {type: "SupplierSpecific", code: identifier.substring("urn:pathfinder:product:customcode:vendor-assigned:".length)};
        }else if(identifier.startsWith("urn:pathfinder:product:customcode:buyer-assigned:")) {
            return {type: "BuyerSpecific", code: identifier.substring("urn:pathfinder:product:customcode:buyer-assigned:".length)};
        }
        return null;
    }).filter(productIdentifier => productIdentifier != null);
}