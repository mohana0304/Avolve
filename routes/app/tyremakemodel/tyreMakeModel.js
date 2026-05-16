const models = require('../../../models');
const { RaiseLogEvent } = require("../../../lib/helpers/rmqlog.js")
const path = require('path');
const { handleApiError } = require('../../middlewares/helper')

exports.list = async function (req, res) {
	const ROUTE = 'app/tyremakemodels/list'
	try {
		let TyreMakeModels = await models.TyreMakeModel.findAll({
			where: { apollo: true },
			raw: true
		});

		TyreMakeModels.map(x => {
			if (x.imagePath) x.imagePath = path.join('/images/tyres/', x.imagePath)
			return x
		});

		return res.send({ success: true, results: TyreMakeModels });
	} catch (err) {
		return handleApiError(res, ROUTE, 'Error fetching list', err);
	}
}

exports.saveEnquiry = async function (req, res) {
	const ROUTE = 'app/tyremakemodels/saveEnquiry';
	try {
		RaiseLogEvent(ROUTE, req.body.customerName, req.body, `Requested by ${res.locals.userFullName} (${res.locals.UserId})`);
		let Lead = await models.Lead.create({
			leadSource: 7,
			custName: req.body.customerName,
			custLocation: req.body.customerLocation,
			phone1: req.body.customerPhone,
			requirement: req.body.tyreMake + '-' + req.body.tyreModel,
			comments: 'Qty - ' + req.body.quantity,
			AccountId: res.locals.AccountId
		})

		return res.send({ success: true, info: Lead });
	} catch (err) {
		return handleApiError(res, ROUTE, 'Error creating Lead', err);
	};
}
