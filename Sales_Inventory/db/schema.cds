namespace sales.inventory;

using { cuid } from '@sap/cds/common';

entity Categories : cuid{

    categoryName : String(100) not null;
    description  : String(255);
    products : Association to many Products on products.category = $self;
}


entity Products : cuid {

    productCode : String(50) not null;
    productName : String(150) not null;
    description : String(255);
    category : Association to Categories;
    unitPrice : Decimal(15,2);
    stockQty  : Decimal(15,2);
    status : String(20) default 'ACTIVE';
    sales : Association to many Sales on sales.product = $self;
}

entity Customers : cuid {

    customerCode : String(50) not null;
    customerName : String(150) not null;
    email   : String(150);
    phone   : String(30);
    address : String(255);
    sales : Association to many Sales on sales.customer = $self;
}

entity Sales : cuid {

    saleNumber : String(50) not null;
    customer : Association to Customers;
    product : Association to Products;
    quantity : Decimal(15,2);
    unitPrice : Decimal(15,2);
    totalAmount : Decimal(15,2);
    saleDate : Timestamp; 
    status : String(20) default 'CREATED';
    remarks : String(255);
 
}

entity Inventory :cuid{
    stockQty:Integer;
    reservedQty:Integer;
    lastUpdated:DateTime;
    warehouse:Association to Warehouses; //201
    product:Association to Products;
}


entity Warehouses: cuid{
    warehouseCode:String;
    warehouseName:String;
    location:String;
    status:String;
    inventory: Association to many Inventory on inventory.warehouse=$self;
}



