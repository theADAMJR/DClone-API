import DBWrapper from './db-wrapper';
import { Lean, PermissionTypes } from './types/entity-types';
import { hasPermission, Role, RoleDocument } from './models/role';
import { generateSnowflake } from './snowflake-entity';

export default class Roles extends DBWrapper<string, RoleDocument> {
  public async get(id: string | undefined) {
    const role = await Role.findById(id);
    if (!role)
      throw new TypeError('Role Not Found');
    return role;
  }

  public async isHigher(firstRoleIds: string[], secondRoleIds: string[]) {
    const uniqueIds = Array.from(new Set(firstRoleIds.concat(secondRoleIds)));
    const highestRole: Lean.Role = (await Role
      .find({ _id: { $in: uniqueIds } }))
      .sort((a, b) => (a.position > b.position) ? 1 : -1)[0];

    return firstRoleIds.includes(highestRole?._id);
  }

  public async hasPermission(member: Lean.GuildMember, permission: PermissionTypes.PermissionString) {
    const totalPerms = (await Role
      .find({ _id: { $in: member.roleIds } }))
      .reduce((acc, value) => value.permissions | acc, 0);
    
    const permNumber = (typeof permission === 'string')
      ? PermissionTypes.All[PermissionTypes.All[permission as string]]
      : permission;    
    return hasPermission(totalPerms, permNumber as any);
  }

  public create(name: string, guildId: string) {
    return Role.create({
      _id: generateSnowflake(),
      guildId,
      mentionable: false,
      hoisted: false,
      name,
      position: 1,
      permissions: PermissionTypes.defaultPermissions
    });
  }
}
