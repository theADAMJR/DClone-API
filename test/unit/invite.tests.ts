import { generateSnowflake } from '../../src/data/snowflake-entity';
import { test, given } from 'sazerac';
import { longArray, longString, mongooseError } from '../test-utils';
import { Invite } from '../../src/data/models/invite';

test(createInvite, () => {
  given().expect(true);
  given({ createdAt: null }).expect('Created At is required');
  given({ createdAt: new Date() }).expect(true);
  given({ guildId: '' }).expect('Guild ID is required');
  given({ guildId: '123' }).expect('Invalid Snowflake ID');
  given({ guildId: generateSnowflake() }).expect(true);
  given({ inviterId: '' }).expect('Inviter ID is required');
  given({ inviterId: '123' }).expect('Invalid Snowflake ID');
  given({ inviterId: generateSnowflake() }).expect(true);
  given({ options: inviteOptions() }).expect(true);
  given({ options: inviteOptions({ maxUses: 0 }) }).expect('Max uses too low');
  given({ options: inviteOptions({ maxUses: 100 }) }).expect(true);
  given({ options: inviteOptions({ maxUses: 1001 }) }).expect('Max uses too high');
});

function createInvite(invite: any) {
  const error = new Invite({
    _id: generateSnowflake(),
    inviterId: generateSnowflake(),
    guildId: generateSnowflake(),
    content: 'hi',
    createdAt: new Date(),
    ...invite,
  }).validateSync();

  return mongooseError(error);
}
function inviteOptions(options?: any) {
  return {
    expiresAt: new Date(),
    maxUses: 100,
    ...options,
  }
}
