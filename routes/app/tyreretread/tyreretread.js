const models = require("../../../models");
const { RaiseLogEvent } = require("../../../lib/helpers/rmqlog");
const { handleApiError } = require('../../middlewares/helper')

exports.list = async function (req, res) {
	const ROUTE = 'app/tyreretreads/list'
	try {
		if (['XE FTE', 'ARSA'].includes(res.locals.role) && !req.query.AccountId) { //For xpert edge - customers based
			return res.send({ success: false, error: 'Please select customer to proceed.' });
		}

		let AccountId = res.locals.AccountId;
		if (req.query.AccountId) {
			AccountId = req.query.AccountId;
		}

		const TyreRetread = await models.TyreRetread.findAll({
			where: { AccountId: AccountId },
			raw: true
		});

		res.send({ success: true, results: TyreRetread });
	} catch (error) {
		return handleApiError(res, ROUTE, 'Error fethcing tyre retreads', error);
	}
}