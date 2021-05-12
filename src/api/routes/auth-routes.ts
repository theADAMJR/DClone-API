import { Router } from 'express';
import { User } from '../../data/models/user';
import passport from 'passport';
import Deps from '../../utils/deps';
import Users from '../../data/users';
import { Verification } from '../modules/email/verification';
import { fullyUpdateUser, updateUsername, validateUser } from '../modules/middleware';
import { EmailFunctions } from '../modules/email/email-functions';
import { APIError } from '../modules/api-error';
import { generateInviteCode } from '../../data/models/invite';

export const router = Router();

const sendEmail = Deps.get<EmailFunctions>(EmailFunctions);
const users = Deps.get<Users>(Users);
const verification = Deps.get<Verification>(Verification);

router.post('/login',
  updateUsername,
  passport.authenticate('local', { failWithError: true }),
  async (req, res) => {
  const user = await users.getByUsername(req.body.username);
  if (!user)
    throw new APIError(400, 'Invalid credentials');  

  if (user.verified) {
    await sendEmail.verifyCode(user as any);
    return res.status(200).json({ verify: true });
  } else if (req.body.email) 
    throw new APIError(400, 'Email is unverified');

  return res.status(200).json(users.createToken(user.id));
});

router.get('/verify-code', async (req, res) => {
  const email = verification.getEmailFromCode(req.query.code as any);
  const user = await User.findOne({ email });
  if (!email || !user)
    throw new APIError(400, 'Invalid code');

  verification.delete(email);
  res.status(200).json(users.createToken(user.id));
});

router.get('/send-verify-email', fullyUpdateUser, validateUser, async (req, res) => {
  const email = req.query.email?.toString();
  if (!email)
    throw new APIError(400, 'Email not provided');

  if (req.query.type === 'FORGOT_PASSWORD') {
    await sendEmail.forgotPassword(email, res.locals.user);
    return res.status(200).json({ verify: true });
  }
  await sendEmail.verifyEmail(email, res.locals.user);

  await User.updateOne(
    { _id: res.locals.user.id },
    { email },
    { runValidators: true, context: 'query' },
  );
  return res.status(200).json({ verify: true });
});

router.get('/verify-email', async (req, res) => {
  const email = verification.getEmailFromCode(req.query.code as string);  
  if (!email)
    throw new APIError(400, 'Invalid code');

  await User.updateOne(
    { email },
    { verified: true },
    { runValidators: true, context: 'query' },
  );

  res.redirect(`${process.env.WEBSITE_URL}/channels/@me?success=Successfully verified your email.`);
});

// they either have to have a code, or use old password
router.post('/change-password', async (req, res) => {
  const user = await User.findOne({ email: req.body.email, verified: true }) as any;
  if (!user)
    throw new APIError(400, 'User Not Found');

  const code = verification.get(req.query.code as string);
  const canReset = code?.type === 'FORGOT_PASSWORD';

  if (canReset) {
    await user.setPassword(req.body.newPassword);  
    await user.save();
  } else {
    await user.changePassword(req.body.oldPassword, req.body.newPassword);  
    await user.save();
  }

  return res.status(200).json(
    users.createToken(user.id)
  );
});
