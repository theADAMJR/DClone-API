import { Channel, ChannelDocument } from '../data/models/channel';
import { User, UserDocument } from '../data/models/user';
import { generateSnowflake } from '../data/snowflake-entity';
import io from 'socket.io-client';
import Log from '../utils/log';
import { Guild, GuildDocument } from '../data/models/guild';
import { Invite } from '../data/models/invite';
import { generateInviteCode } from '../utils/utils';
import { MessageDocument } from '../data/models/message';
import { GuildMember } from '../data/models/guild-member';
import Deps from '../utils/deps';
import Messages from '../data/messages';
import Users from '../data/users';

export class SystemBot {
  public readonly socket = io(`http://localhost:${process.env.PORT}`);

  private _self: UserDocument;
  get self() { return this._self; }

  constructor(
    private messages = Deps.get<Messages>(Messages),
    private users = Deps.get<Users>(Users),
  ) {
    this.socket.on('connect', () => Log.info('Connected to ws client', 'bot'));
    this.socket.connect();
  }

  public async init() {
    this._self = await this.users.getSystemUser();

    await this.readyUp();

    this.hookWSEvents();
  }

  private async readyUp() {
    const channels = await Channel.find({
      type: 'DM',
      recipientIds: this.self._id
    });
    const channelIds: string[] = channels.map(d => d.id);
    const guildIds: string[] = [];

    const botMembers = await GuildMember.find({ user: this.self.id });
    for (const member of botMembers) {
      const guild = await Guild.findById(member.guildId);
      guildIds.push(guild.id);

      for (const channel of guild.channels)
        channelIds.push(channel as any);
    }

    this.socket.emit('READY', { user: this.self, guildIds, channelIds });

    Log.info('Initialized bot', 'bot');
  }

  public sendMessage(channel: ChannelDocument, guild: GuildDocument, content: string) {
    this.socket.emit('MESSAGE_CREATE', {
      author: this.self, channel, content, guild,
    });
  }

  private hookWSEvents() {
    this.socket.on('MESSAGE_CREATE', async (message: MessageDocument) => {
      const author = await this.users.get(message.authorId);

      message = await this.messages.get(message._id);
      if (!message.guild && author.bot) return;

      if (message.content.toLowerCase() === 'hi') {
        this.socket.emit('MESSAGE_CREATE', {
          authorId: this.self._id,
          channelId: message.channelId,
          content: `Hi, @${author.username}!`
        });
      }
    });
  }

  async dm(recipient: UserDocument, content: string) {
    this.socket.emit('MESSAGE_CREATE', {
      author: this.self,
      channel: await this.getDMChannel(recipient),
      content
    });
  }

  async getDMChannel(user: UserDocument) {
    return await Channel.findOne({ recipientIds: [user._id, this.self._id] })
      ?? await Channel.create({
        _id: generateSnowflake(),
        createdAt: new Date(),
        type: 'DM',
        recipientIds: [user._id, this.self._id]
      });
  }

  public async addToGuild(guildId: string) {
    const invite = await Invite.create({
      _id: generateInviteCode(),
      createdAt: new Date(),
      expiresAt: null,
      guildId,
      inviterId: this.self._id,
      maxUses: 1,
      uses: 0
    });

    this.socket.emit('GUILD_MEMBER_ADD', {
      inviteCode: invite.id,
      user: this.self
    });

    const systemChannel = await Channel.findOne({ guildId, type: 'TEXT' });
    this.socket.emit('MESSAGE_CREATE', {
      author: this.self,
      channel: systemChannel,
      content: `Hi, I'm **2PG**! 🤖`
    });
  }
}
