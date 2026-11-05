const cds = require("@sap/cds");

module.exports = cds.service.impl(async function () {

    const {
        Customers,
        ClaimTypes,
        Employees
    } = this.entities;



    // Check duplicate customer number
    this.before("CREATE", Customers, async (req) => {

        const { customerNumber } = req.data;

        const existingCustomer = await SELECT.one
            .from(Customers)
            .where({ customerNumber });

        if (existingCustomer) {
            req.error(
                409,
                "Customer number already exists"
            );
        }
    });



    // Check duplicate claim type code
    this.before("CREATE", ClaimTypes, async (req) => {

        const { code } = req.data;

        const existingClaimType = await SELECT.one
            .from(ClaimTypes)
            .where({ code });

        if (existingClaimType) {
            req.error(
                409,
                "Claim type code already exists"
            );
        }
    });



    // Check duplicate employee number
    this.before("CREATE", Employees, async (req) => {

        const { employeeNumber } = req.data;

        const existingEmployee = await SELECT.one
            .from(Employees)
            .where({ employeeNumber });

        if (existingEmployee) {
            req.error(
                409,
                "Employee number already exists"
            );
        }
    });


    // Check duplicate employee number during update
    this.before("UPDATE", Employees, async (req) => {

        const { employeeNumber, ID } = req.data;

        if (!employeeNumber) {
            return;
        }

        const existingEmployee = await SELECT.one
            .from(Employees)
            .where({
                employeeNumber,
                ID: { "!=": ID }
            });

        if (existingEmployee) {
            req.error(
                409,
                "Employee number already exists"
            );
        }
    });
    this.on("changeEmployeeStatus", async (req) => {

        const {
            employeeId,
            active
        } = req.data;

        const employee = await SELECT.one
            .from(Employees)
            .where({ ID: employeeId });

        if (!employee) {
            req.error(
                404,
                "Employee not found"
            );
        }

        await UPDATE(Employees)
            .set({
                active: active
            })
            .where({
                ID: employeeId
            });

        return true;
    });


    this.on("changeClaimTypeStatus", async (req) => {

        const {
            claimTypeId,
            active
        } = req.data;

        const claimType = await SELECT.one
            .from(ClaimTypes)
            .where({ ID: claimTypeId });

        if (!claimType) {
            req.error(
                404,
                "Claim type not found"
            );
        }

        await UPDATE(ClaimTypes)
            .set({
                active: active
            })
            .where({
                ID: claimTypeId
            });

        return true;
    });


    this.on("getActiveEmployeesByRole", async (req) => {

        const { role } = req.data;

        if (!role) {
            req.error(
                400,
                "Employee role is required"
            );
        }

        const employees = await SELECT
            .from(Employees)
            .where({
                role: role,
                active: true
            });

        return employees;
    });


});