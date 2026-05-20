const env = process.env.NODE_ENV || "development";
const app_json = process.env.NODE_ENV_APP_JSON || 'app.json';
const jwt = require('jsonwebtoken');
const models = require("../../../models");
const logger = require('../../../lib/helpers/rmqlog');
const AppConfig = require('../../../config/' + app_json)[env];
const config = require('../../../config/security.json');
const avolveHelper = require('../../../lib/helpers/avolveHelper');
const { error } = require('node:console');

exports.login = async function (req, res) {
	try {
		if (!req.body.mobile) {
			return res.status(401).send({ success: false, error: 'Missing mobile number' });
		}
		if (!req.body.pwd) {
			return res.status(401).send({ success: false, error: 'Missing password' });
		}

		let mobileNo = req.body.mobile.replace(/  /g, '');
		if (mobileNo.trim().length != 10) {
			return res.send({ success: false, error: 'Please enter valid mobile number.' });
		}

		let User = await models.User.findOne({
			include: [{
				attributes: ['id'],
				model: models.Group
			}, {
				attributes: ['id', 'name'],
				model: models.UserRole,
				where: {
					name: { $ne: 'Admin' }
				},
				required: true
			},
			{
				attributes: ['id', 'tname', 'status', 'type', 'details'],
				model: models.Account,
				where: {
					$or: {
						AccountIdParent: AvolveMasterId,
						id: AvolveMasterId
					},
					status: 1
				}
			}],
			where: {
				mobile: mobileNo,
				activeStatus: true
			}
		});

		if (!User) {
			return res.status(401).send({ success: false, error: `User with mobile ${mobileNo} not found` });
		}

		if (!User.UserRole) {
			return res.send({ success: false, error: 'Role not assigned to this user.' });
		}

		if (!User.Account) {
			return res.send({ success: false, error: 'Customer not assigned to this user.' });
		}

		if (['FM', 'FO', 'KAM', 'DE FTE', 'XE FTE', 'ARSA', 'AMCS FTE', 'AMCC FTE', 'ZM', 'FTS ZM', 'HO Sales', 'FTS HO', 'FTS KAM'].indexOf(User.UserRole.name) == -1) {
			return res.send({ success: false, error: 'Not Authorized to this user role.' });
		}

		let userAgent = req.headers['user-agent'] === undefined ? '' : req.headers['user-agent'];

		const attemptsKey = `login_attempts:${mobileNo}`;
		const lockKey = `login_lock:${mobileNo}`;

		models.redis.get(lockKey,async function (err,isLocked){
			if (err) {
				return res.send({ succcess: false, error: 'Error while checking account lock' });
			}

			if (isLocked) {
				return res.status(401).send({ success: false, error: 'Account locked. please try again after 60 minutes.' });
			}
			
			models.User.checkPassword(req.body.pwd, User.password, async function (err, match) {
				if (!match) {
					models.redis.get(attemptsKey, function (err, attempts){
						if (err) {
							return res.send({ success: false, error: 'Error while checking login attempts' });
						}

						attempts = attempts ? parseInt(attempts) : 0;
						attempts++;

						if (attempts >= 3) {
							models.redis.setex( lockKey, 5 * 60,'LOCKED');
							models.redis.del(attemptsKey);
							return res.status(401).send({ success: false, error: 'Account locked for 60 minutes due to multiple incorrect password attempts.' });
						}

						models.redis.setex( attemptsKey, 5 * 60, attempts );

						return res.status(401).send({ succcess: false, error: `Incorrect password. ${3 - attempts} attempts remaining.` });
					});

				}

				models.redis.del(attemptsKey);

				//#region logic to find mobile no in multiple profiles
				let response = await avolveHelper.getUsersByMobile(mobileNo);
				if (!response.success) {
					logger.RaiseLogEvent('avolve/users/login', 'error', response.error, `Data ${JSON.stringify(req.body)}`);
					return res.send({ success: false, error: 'Error in processing your request.' });
				}
				if (response.results && response.results.length > 1) { //Multiple profile response
					return res.send({ success: false, multiple: true, results: response.results });
				}
				//#endregion
				let Account = User.Account;
				if (userAgent.includes("Load Board/") && Account.type != 6) {
					return res.send({ success: false, error: 'Account not authorized' });
				}
				let dataUserObj = initDataForAvolveLogin(Account, User);
				let userObj = dataUserObj.user;
				let dataObj = dataUserObj.data;

				models.redis.get('accountsec:' + Account.id, function (err, secret) {
					if (secret == null) {
						secret = config.session.secret;
					}
					dataObj.success = true;
					dataObj.sessionToken = jwt.sign(buildReplyUserLogin(userObj), secret, { expiresIn: '7d' });
					return res.send(dataObj);
				});
			});

		});
	} catch (err) {
		console.log(`avolve/users/login`, err);
		logger.RaiseLogEvent('avolve/users/login', 'error', err, `Data ${JSON.stringify(req.body)}`);
		return res.send({ success: false, error: 'Error in processing your request.' });
	}
}