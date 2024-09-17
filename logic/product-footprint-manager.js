/*!
 * Copyright 2024 Takuro Okada.
 * Released under the MIT License.
 */

// @ts-check

import { connection } from "../utility/database.js";
import { ErrorResponse, ErrorCode } from "arbuscular";
import { updateOrganization } from "./organization-manager.js";
import { updateProduct } from "./product-manager.js";

/**
 * @param {number} organizationId 
 * @param {string} organizationName 
 * @param {Array<string>} organizationIdentifiers
 * @param {string} productName 
 * @param {Array<string>} productIdentifiers
 * @returns {Promise} 
 */
export async function updateProductFootprint(organizationId, organizationName, organizationIdentifiers, productName, productIdentifiers, productFootprintId) {
    if(organizationName != null && organizationIdentifiers != null) {
        await updateOrganization(organizationId, organizationName, organizationIdentifiers);
    }
    let product = await updateProduct(organizationId, productName, productIdentifiers);
    let transaction = await connection.transaction();
    try {
        let records = await transaction.select("productFootprintId").from("ProductFootprint").where({ProductId: product.productId, DataId: productFootprintId});
        if(records.length != 0) {
            return;
        }
        let ids = await transaction.insert({
            DataId: productFootprintId,
            ProductId: product.productId
        }).into("ProductFootprint");
        if(ids.length != 1) throw ErrorResponse(ErrorCode.StateError, "Inserting failed.");
        await transaction.commit();
    }catch(error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * @typedef {object} ProductFootprint
 * @property {number} organizationId
 * @property {string} organizationName
 * @property {number} productId
 */

/**
 * @param {number} productFootprintId 
 * @returns {Promise<ProductFootprint>}
 */
export async function getProductFootprint(productFootprintId) {
    let records = await connection.select("Organization.OrganizationId as organizationId", "organizationName", "Product.ProductId as productId", "productName")
        .from("ProductFootprint")
        .leftJoin("Product", "Product.ProductId", "ProductFootprint.ProductId")
        .leftJoin("Organization", "Organization.OrganizationId", "Product.OrganizationId")
        .where({DataId: productFootprintId});
    return records.length > 0 ? records[0] : null;
}