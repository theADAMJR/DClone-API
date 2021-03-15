import { Socket } from 'socket.io';
import { PermissionTypes } from '../../../data/types/entity-types';
import { Guild } from '../../../data/models/guild';
import { Role } from '../../../data/models/role';
import { generateSnowflake } from '../../../data/snowflake-entity';
import Deps from '../../../utils/deps';
import { WSGuard } from '../../modules/ws-guard';
import { WebSocket } from '../websocket';
import WSEvent, { Args, Params } from './ws-event';

export default class implements WSEvent {
  on = 'GUILD_ROLE_CREATE';

  constructor(
    private guard = Deps.get<WSGuard>(WSGuard)
  ) {}

  // TODO: throw errors when cannot manage
  async invoke(ws: WebSocket, client: Socket, { guildId, partialRole }: Params.GuildRoleCreate) {
    await this.guard.can(client, guildId, PermissionTypes.General.MANAGE_ROLES);
    // if adding an audit log, you would log the client made a role here

    const role = await Role.create({
      ...partialRole,
      _id: generateSnowflake(),
      createdAt: new Date(),
      guildId
    });
    await Guild.updateOne(
      { _id: guildId },
      { $push: { roles: role },
    });

    ws.io.sockets
      .to(guildId)
      .emit('GUILD_ROLE_CREATE', { role } as Args.GuildRoleCreate);
  }
}