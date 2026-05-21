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
				return res.status(401).send({ success: false, error: 'Account locked. please try again after 5 minutes.' });
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


exports.resetPasswordV2 = async function (req, res) {
	logger.RaiseLogEvent('avolve/users/resetPasswordV2', req.body.mobile || 'log', req.body, 'Data received');
	try {
		if (!req.body.mobile) {
			logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', req.body, 'Mobile number missing');
			return res.status(401).send({ success: false, error: 'Missing mobile number' });
		}

		const mobileNo = (req.body.mobile || '').replace(/\D/g, '');
		if (mobileNo.trim().length != 10) {
			return res.status(401).send({ success: false, error: 'Please enter valid mobile number.' });
		}

		//#region User Validation
		const User = await models.User.findOne({
			attributes: ['id', 'username', 'mobile'],
			include: [{
				model: models.Account,
				attributes: ['id', 'name', 'tname', 'phone1', 'type'],
				required: true,
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
			return res.send({ success: false, error: `User with mobile ${mobileNo} not found.` });
		}

		if (!User.mobile) {
			return res.send({ success: false, error: 'Mobile number not mapped with user. Please update and proceed.' });
		}

		if (!User.Account) {
			return res.send({ success: false, error: `Account not found for user ${User.username}` });
		}

		if (![10, 11].includes(User.Account.type)) {
			logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', req.body, 'Your account is not mapped to Avolve.');
			return res.send({ success: false, error: 'Your account is not mapped to Avolve.' });
		}
		//#endregion

		const accountId = User.Account.id;
		const redisOtpKey = `avlUserOtp:${User.mobile}`;
		const redisOtpTokenKey = `avlOtpToken:${User.mobile}`;
		const otpVerifyAttemptKey = `${OTP_ATTEMPT_KEY_PREFIX}:${accountId}:${User.mobile}`;
		const otpResendAttemptKey = `${OTP_RESEND_KEY_PREFIX}:${accountId}:${User.mobile}`;
		const secret = config.session.secret;

		// BRANCH: Generate new OTP  (!otp && !pwd && !resend)
		if (!req.body.otp && !req.body.pwd && !req.body.resend) {
			models.redis.get(otpVerifyAttemptKey, async function (err, attemptRaw) {
				if (err) {
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data: ${JSON.stringify(req.body)}`);
					return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
				}

				// Check lockout FIRST — before even reading the OTP key
				const attemptData = attemptRaw ? JSON.parse(attemptRaw) : null;
				if (attemptData && attemptData.count >= OTP_ATTEMPT_LIMIT) {
					const remainingMs = (OTP_ATTEMPT_TTL * 1000) - (Date.now() - attemptData.firstAttemptAt);
					const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { count: attemptData.count }, 'Mobile screen — still locked');
					return res.status(429).send({ success: false, redirect: true, error: `You've exceeded the Valid OTP attempt limit. Please try again after ${remainingMins} minute(s).` });
				}

				// Lockout clear — now check for a live OTP session
				models.redis.get(redisOtpKey, async function (err, otpRedis) {
					if (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
					}

					if (otpRedis) {
						return res.status(403).send({ success: false, error: 'OTP already sent. Please check your SMS or use the resend option.' });
					}

					const otp = getRandomInt(10000, 99999);
					try {
						await sendOtpSms(User.mobile, otp);
					} catch (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Error sending OTP. Please try again.' });
					}

					models.redis.set(redisOtpKey, otp);
					models.redis.expire(redisOtpKey, 180); // 3 MINS
					return res.status(203).send({ success: true, error: `An SMS with a verification code was sent to ${maskMobile(User.mobile)}.` });
				});
			});

			// BRANCH: Resend OTP  (resend)
		} else if (req.body.resend) {
			models.redis.get(redisOtpKey, async function (err, otpRedis) {
				if (err) {
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
					return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
				}

				if (!otpRedis) {
					return res.status(403).send({ success: false, redirect: true, error: 'No ongoing OTP session found.' });
				}

				models.redis.get(otpResendAttemptKey, async function (err, resendRaw) {
					if (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
					}

					const resendData = resendRaw ? JSON.parse(resendRaw) : null;
					if (resendData && resendData.count >= OTP_RESEND_LIMIT) {
						const remainingMs = (OTP_RESEND_TTL * 1000) - (Date.now() - resendData.firstResendAt);
						const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { resendCount: resendData.count }, 'OTP Resend rate limit exceeded');
						return res.status(429).send({ success: false, redirect: true, error: `OTP Resend limit reached. Please request a new OTP after ${remainingMins} minute(s).` });
					}

					const newOtp = getRandomInt(10000, 99999);
					try {
						await sendOtpSms(User.mobile, newOtp);
					} catch (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Error sending OTP. Please try again.' });
					}

					// Update redis with New OTP
					models.redis.set(redisOtpKey, newOtp);
					models.redis.expire(redisOtpKey, 180); // 3 MINS

					const newResendCount = (resendData ? resendData.count : 0) + 1;
					const resendRecord = JSON.stringify({
						count: newResendCount,
						firstResendAt: resendData ? resendData.firstResendAt : Date.now()
					});

					// delete previous otp attempt in redis after otp resend
					models.redis.del(otpVerifyAttemptKey);
					models.redis.set(otpResendAttemptKey, resendRecord, 'EX', OTP_RESEND_TTL);

					const resendsLeft = OTP_RESEND_LIMIT - newResendCount;
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { newResendCount, resendsLeft }, 'OTP resent');
					return res.status(203).send({ success: true, error: `OTP resent to your registered mobile ${maskMobile(User.mobile)}.` });
				});
			});

			// BRANCH: Verify OTP  (otp && !pwd)
		} else if (req.body.otp && !req.body.pwd) {
			models.redis.get(otpVerifyAttemptKey, async function (err, attemptRaw) {
				if (err) {
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
					return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
				}

				const attemptData = attemptRaw ? JSON.parse(attemptRaw) : null;
				if (attemptData && attemptData.count >= OTP_ATTEMPT_LIMIT) {
					const remainingMs = (OTP_ATTEMPT_TTL * 1000) - (Date.now() - attemptData.firstAttemptAt);
					const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { count: attemptData.count }, 'OTP locked');
					return res.status(429).send({ success: false, redirect: true, error: `Too many incorrect attempts. Please try again after ${remainingMins} minute(s).` });
				}

				models.redis.get(redisOtpKey, async function (err, otpRedis) {
					if (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
					}

					if (!otpRedis || String(req.body.otp) !== String(otpRedis)) {
						const newCount = (attemptData ? attemptData.count : 0) + 1;
						const attemptsLeft = OTP_ATTEMPT_LIMIT - newCount;
						const record = JSON.stringify({
							count: newCount,
							firstAttemptAt: attemptData ? attemptData.firstAttemptAt : Date.now(),
							verified: false
						});
						models.redis.set(otpVerifyAttemptKey, record, 'EX', OTP_ATTEMPT_TTL);
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { newCount, attemptsLeft }, 'Invalid OTP');

						if (attemptsLeft <= 0) {
							// Delete OTP + resend keys so mobile screen sees lockout, not "OTP already sent"
							models.redis.del(redisOtpKey);
							models.redis.del(otpResendAttemptKey);
							return res.status(429).send({ success: false, redirect: true, error: 'Too many incorrect OTP attempts. Please request a new OTP after 30 minute(s).' });
						}
						return res.status(403).send({ success: false, error: `Invalid OTP. You have ${attemptsLeft} attempt(s) remaining.` });
					}

					// OTP correct — mark verified, keep attempt key alive for Stage 2
					const verifiedRecord = JSON.stringify({
						count: attemptData ? attemptData.count : 0,
						firstAttemptAt: attemptData ? attemptData.firstAttemptAt : Date.now(),
						verified: true
					});
					models.redis.set(otpVerifyAttemptKey, verifiedRecord, 'EX', OTP_ATTEMPT_TTL);

					const otpAuthToken = jwt.sign({ UserId: User.id, mobile: User.mobile, otpVerified: true }, secret, { expiresIn: OTP_AUTH_TOKEN_TTL });
					models.redis.set(redisOtpTokenKey, otpAuthToken, 'EX', OTP_AUTH_TOKEN_TTL);
					await User.update({ activeStatus: true });
					return res.send({ success: true, otpAuthToken: otpAuthToken });
				});
			});

			// BRANCH: Set new password  (pwd)
		} else if (req.body.pwd) {
			models.redis.get(otpVerifyAttemptKey, async function (err, attemptRaw) {
				if (err) {
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
					return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
				}

				const attemptData = attemptRaw ? JSON.parse(attemptRaw) : null;
				if (attemptData && attemptData.count >= OTP_ATTEMPT_LIMIT) {
					const remainingMs = (OTP_ATTEMPT_TTL * 1000) - (Date.now() - attemptData.firstAttemptAt);
					const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
					logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { count: attemptData.count }, 'Pwd stage locked');
					return res.status(429).send({ success: false, redirect: true, error: `Too many incorrect OTP attempts. Please try again after ${remainingMins} minute(s).` });
				}

				// Stage 1 must have completed — verified flag required
				if (!attemptData || !attemptData.verified) {
					return res.status(403).send({ success: false, redirect: true, error: 'OTP verification required before setting a new password.' });
				}

				models.redis.get(redisOtpKey, async function (err, otpRedis) {
					if (err) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
						return res.status(500).send({ success: false, error: 'Server error. Please try again.' });
					}

					if (!req.body.otp || !otpRedis || String(req.body.otp) !== String(otpRedis)) {
						const newCount = (attemptData ? attemptData.count : 0) + 1;
						const attemptsLeft = OTP_ATTEMPT_LIMIT - newCount;
						const record = JSON.stringify({
							count: newCount,
							firstAttemptAt: attemptData ? attemptData.firstAttemptAt : Date.now(),
							verified: attemptData ? attemptData.verified : false
						});
						models.redis.set(otpVerifyAttemptKey, record, 'EX', OTP_ATTEMPT_TTL);
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, { newCount, attemptsLeft }, 'Invalid OTP on pwd stage');

						if (attemptsLeft <= 0) {
							models.redis.del(redisOtpKey);
							models.redis.del(otpResendAttemptKey);
							return res.status(429).send({ success: false, redirect: true, error: 'Too many incorrect OTP attempts. Please request a new OTP after 30 minute(s).' });
						}
						return res.status(403).send({ success: false, error: `Invalid or missing OTP. You have ${attemptsLeft} attempt(s) remaining.` });
					}

					// Verify OTP Auth Token					
					const headerToken = req.get('X-AVL-OtpToken');
					if (!headerToken) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', req.body, 'OTP auth token missing in header');
						return res.status(403).send({ success: false, error: 'Valid OTP required.' });
					}
					const isTokenVerified = await verifyAuthToken(headerToken, redisOtpTokenKey, secret);
					if (!isTokenVerified) {
						logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', req.body, 'Invalid or expired OTP token');
						return res.status(403).send({ success: false, error: 'Invalid or expired OTP token.' });
					}

					// Hash and persist the new password
					models.User.hash(req.body.pwd, async function (err, hash) {
						if (err || !hash) {
							logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, 'Pwd hash failed');
							return res.status(500).send({ success: false, error: 'Failed to update password. Please try again.' });
						}
						try {
							const multiProfile = await avolveHelper.getUsersByMobile(mobileNo);
							if (multiProfile.results && multiProfile.results.length > 1) {
								logger.RaiseLogEvent('avolve/users/resetPasswordV2', req.body.mobile, multiProfile.results, 'Multiple profiles');
								await models.User.update({ password: hash }, { where: { id: multiProfile.results.map(x => x.id) } });
							} else {
								await User.update({ password: hash });
							}
							// Clean up all three keys only after successful DB write
							models.redis.del(otpVerifyAttemptKey);
							models.redis.del(redisOtpKey);
							models.redis.del(otpResendAttemptKey);
							models.redis.del(redisOtpTokenKey);
							return res.send({ success: true });
						} catch (dbErr) {
							logger.RaiseLogEvent('avolve/users/resetPasswordV2', User.mobile, dbErr, 'DB update failed');
							return res.status(500).send({ success: false, error: 'Failed to update password. Please try again.' });
						}
					});
				});
			});

		} else {
			return res.status(403).send({ success: false, error: 'Invalid operation.' });
		}

	} catch (err) {
		console.log(`avolve/users/resetPasswordV2`, err);
		logger.RaiseLogEvent('avolve/users/resetPasswordV2', 'error', err, `Data ${JSON.stringify(req.body)}`);
		return res.send({ success: false, error: 'Error in processing your request.' });
	}
}