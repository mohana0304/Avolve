const env = process.env.NODE_ENV || "development";
const app_json = process.env.NODE_ENV_APP_JSON || 'app.json';
const jwt = require('jsonwebtoken');
const models = require("../../../models");
const logger = require('../../../lib/helpers/rmqlog');
const AppConfig = require('../../../config/' + app_json)[env];
const config = require('../../../config/security.json');
const avolveHelper = require('../../../lib/helpers/avolveHelper');
const { error } = require('node:console');
const { v4: uuidv4 } = require('uuid');

const SESSION_TTL = 7 * 24 * 60 * 60;

async function redisGet(key) {
  return await models.redis.get(key);
}

async function redisSetEx(key,ttl,value) {
	return await models.redis.setEx(key,ttl,string(value));
}

async function redisSAdd(key, value) {
  return await models.redis.sAdd(key, value);
}

async function redisSRem(key, value) {
  return await models.redis.sRem(key, value);
}

async function redisSMembers(key) {
  return await models.redis.sMembers(key);
}

async function redisExpire(key, ttl) {
  return await models.redis.expire(key, ttl);
}

function sessionKey(sessionId) {
  return `avlSession:${sessionId}`;
}

function userSessionsKey(mobile) {
  return `avlUserSessions:${mobile}`;
}

async function createUserSession(User, mobileNo, req, token) {
  const sessionId = uuidv4();
  const deviceId = req.headers['x-device-id'] || req.body.deviceId || '';
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = req.ip || '';

  const sessionData = {
    sessionId,
    UserId: User.id,
    mobile: mobileNo,
    deviceId,
    sessionToken: token,
    createdAt: new Date()
  };

  await redisSetEx(
    sessionKey(sessionId),
    SESSION_TTL,
    JSON.stringify(sessionData)
  );

  await redisSAdd(userSessionsKey(mobileNo), sessionId);
  await redisExpire(userSessionsKey(mobileNo), SESSION_TTL);

  await models.UserSession.create({
    UserId: User.id,
    mobile: mobileNo,
    sessionId,
    deviceId,
    userAgent,
    ipAddress,
    status: 1
  });
  return sessionId;
}

async function clearAllUserSessions(mobile) {
  const sessionIds = await redisSMembers(userSessionsKey(mobile));
  if (sessionIds && sessionIds.length > 0) {
    for (const sid of sessionIds) {
      await redisDel(sessionKey(sid));
    }
  }
  await redisDel(userSessionsKey(mobile));
  await models.UserSession.update(
    {
      status: 0,
      loggedOutAt: new Date()
    },
    {
      where: {
        mobile,
        status: 1
      }
    }
  );
}

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
					name: { [Op.ne]: 'Admin' }
				},
				required: true
			},
			{
				attributes: ['id', 'tname', 'status', 'type', 'details'],
				model: models.Account,
				where: {
					[Op.or]: {
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

		const isLocked = await redisGet(lockKey);

		if (isLocked) {
			return res.status(401).send({ success: false, error: 'Account locked. please try again after 5 minutes.' });
		}

		models.User.checkPassword(req.body.pwd, User.password, async function (err, match) {
			if (err) {
				return res.status(500).send({ success: false, error: 'Password check error' });
			}
			if (!match) {
				let attempts = await redisGet(attemptsKey);
				attempts = attempts ? parseInt(attempts) : 0;
				attempts++;
				if (attempts >= 3) {
					await redisSetEx(lockKey, 5 * 60, 'LOCKED');
					await redisDel(attemptsKey);
					return res.status(401).send({ success: false, error: 'Account locked for 5 minutes due to multiple incorrect password attempts.' });
				}
				await redisSetEx(attemptsKey, 5 * 60, String(attempts));
				return res.status(401).send({ success: false, error: `Incorrect password. ${3 - attempts} attempts remaining.` });
			}
			await redisDel(attemptsKey);
			//#region logic to find mobile no in multiple profiles
			let response = await avolveHelper.getUsersByMobile(mobileNo);
			if (!response.success) {
				logger.RaiseLogEvent('avolve/users/login','error',response.error,`Data ${JSON.stringify(req.body)}`	);
				return res.send({ success: false, error: 'Error in processing your request.' });
			}
			if (response.results && response.results.length > 1) {
				return res.send({success: false, multiple: true, results: response.results });
			}
			//#endregion
			let Account = User.Account;
			if (userAgent.includes("Load Board/") && Account.type != 6) {
				return res.send({success: false, error: 'Account not authorized' });
			}
			const userObj = {
				id: User.id,
				username: User.username,
				mobile: User.mobile,
				role: User.UserRole.name,
				accountId: Account.id
			};
			const dataObj = { success: true, user: userObj };
			let secret = await redisGet('accountsec:' + Account.id);
			if (secret == null) {
				secret = config.session.secret;
			}
			dataObj.sessionToken = jwt.sign( userObj, secret, { expiresIn: '7d' } );
			const sessionId = await createUserSession(
				User,
				mobileNo,
				req,
				dataObj.sessionToken
			);

			dataObj.sessionId = sessionId;

			return res.send(dataObj);
		});
	} catch (err) {
		console.log(`avolve/users/login`, err);
		logger.RaiseLogEvent('avolve/users/login', 'error', err, `Data ${JSON.stringify(req.body)}`);
		return res.send({ success: false, error: 'Error in processing your request.' });
	}
}

exports.logout = async function (req, res) {
  try {
    const mobile = req.body.mobile;
    const sessionId = req.body.sessionId || req.headers['x-session-id'];

    if (!mobile) {
      return res.status(400).send({ success: false, error: 'Missing mobile number' });
    }

    if (!sessionId) {
      return res.status(400).send({ success: false, error: 'Missing session id' });
    }

    await redisDel(sessionKey(sessionId));
    await redisSRem(userSessionsKey(mobile), sessionId);

    await models.UserSession.update(
      {
        status: 0,
        loggedOutAt: new Date()
      },
      {
        where: {
          mobile,
          sessionId,
          status: 1
        }
      }
    );

    return res.send({ success: true, message: 'Logout successful' });

  } catch (err) {
    console.log('avolve/users/logout', err);
    logger.RaiseLogEvent('avolve/users/logout','error', err,`Data ${JSON.stringify(req.body)}`);
    return res.status(500).send({ success: false,error: 'Error while logout' });
  }
};