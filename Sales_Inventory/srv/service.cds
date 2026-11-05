using { sales.inventory as db } from '../db/schema';

@path: 'sales-inventory'
service MyService {
    entity Products as projection on db.Products;
    entity Categories as projection on db.Categories;
    entity Customers as projection on db.Customers;
    entity Sales as projection on db.Sales;


        // Generate the next product code
    action getNextProductCode() returns String;

    // Create product and its initial inventory record
    action createProduct(
        productName : String(150),
        description : String(255),
        categoryID  : UUID,
        unitPrice   : Decimal(15,2),
        stockQty    : Integer,
        warehouseID : UUID
    ) returns Products;

    
    action activateProduct(
        ID : UUID
    ) returns Products;

    action deactivateProduct(
        ID : UUID
    ) returns Products;

    action getProductStock(
        ID : UUID
    ) returns Decimal(15,2);

    action submitSaleForApproval(
        ID : UUID
    ) returns Sales;

    action completeSale(
        ID : UUID
    ) returns Sales;

    action cancelSale(
        ID : UUID
    ) returns Sales;

    action getTotalSales()
        returns Decimal(15,2);

   action cancelStalePendingSales() returns String;
    

}

@path: 'inventory'
service MyService1 {
    entity Inventory as projection on db.Inventory;
    entity Warehouses as projection on db.Warehouses;

    action adjustStock(
        inventoryID:UUID,
        quantity:Integer
    ) returns String;

    action reserveStock(
        inventoryID:UUID,
        quantity:Integer
    ) returns String;

    action releaseStock(
        inventoryID:UUID,
        quantity:Integer
    ) returns String;
}