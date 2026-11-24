module.exports = function (srv) {
    const cds = require('@sap/cds');

    srv.on('me', (req) => {
        const user = req.user;

        const roles = [
            'Admin',
            'ServiceAgent',
            'TeamLead',
            'ServiceManager',
            'Consultant',
            'SalesManager',
            'Finance'
        ];

        // Find the role assigned to the logged-in user
        const assignedRole = roles.find(role => user.is(role)) || 'Unassigned';

        return {
            userId: user.id || '',
            displayName: user.attr?.name || user.id || 'User',
            email: user.attr?.email || '',
            role: assignedRole
        };
    });
};
