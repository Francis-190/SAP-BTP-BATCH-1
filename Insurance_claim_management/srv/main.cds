using { claimsure as db } from '../db/schema';

service MainService {

    entity Customers as projection on db.Customers;

    entity ClaimTypes as projection on db.ClaimTypes;

    entity Employees as projection on db.Employees;
     action changeEmployeeStatus(
        employeeId : UUID,
        active : Boolean
    ) returns Boolean;


    action changeClaimTypeStatus(
        claimTypeId : UUID,
        active : Boolean
    ) returns Boolean;


    function getActiveEmployeesByRole(
        role : String(30)
    ) returns many Employees;

}