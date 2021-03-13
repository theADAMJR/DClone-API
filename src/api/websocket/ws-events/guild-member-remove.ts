import { Socket } from 'socket.io';
import Guilds from '../../../data/guilds';
import Invites from '../../../data/invites';
import { GuildDocument } from '../../../data/models/guild';
import { GuildMember } from '../../../data/models/guild-member';
import { User } from '../../../data/models/user';
import Users from '../../../data/users';
import Deps from '../../../utils/deps';
import { WebSocket } from '../websocket';
import WSEvent, { Args, Params } from './ws-event';

export default class implements WSEvent {
  on = 'GUILD_MEMBER_REMOVE';

  constructor(
    private guilds = Deps.get<Guilds>(Guilds),
    private invites = Deps.get<Invites>(Invites),
    private users = Deps.get<Users>(Users),
  ) {}

  async invoke(ws: WebSocket, client: Socket, { guildId, userId }: Params.GuildMemberRemove) {
    const guild = await this.guilds.get(guildId);
    const memberExists = guild.members.some(m => m.userId === userId);
    if (memberExists)
      throw new TypeError('Member does not exist');
    
    await GuildMember.deleteOne({ userId });
    await User.updateOne(
      { _id: userId },
      { guilds: { $pull: guildId } as any }
    );
    this.leaveGuildRooms(client, guild);

    ws.io
      .to(guildId)
      .emit('GUILD_MEMBER_REMOVE', { userId } as Args.GuildMemberRemove);
    ws.io
      .to(client.id)
      .emit('GUILD_LEAVE', { guildId } as Args.GuildLeave);
  }

  leaveGuildRooms(client: Socket, guild: GuildDocument) {
    client.leave(guild.id);
    for (const channel of guild.channels)
      client.leave(channel._id);
  }
}
