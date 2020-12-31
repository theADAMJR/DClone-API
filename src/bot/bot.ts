import { Channel, ChannelType } from '../data/models/channel';
import { StatusType, User, UserDocument } from '../data/models/user';
import { generateSnowflake } from '../data/snowflake-entity';
import io from 'socket.io-client';
import Log from '../utils/log';
import { Guild } from '../data/models/guild';
import { Invite } from '../data/models/invite';
import { generateInviteCode } from '../utils/utils';
import { MessageDocument } from '../data/models/message';
import fetch from 'node-fetch';
import { GuildMember } from '../data/models/guild-member';
import Deps from '../utils/deps';
import Messages from '../data/messages';

export class Bot {
  private socket = io(`http://localhost:${process.env.PORT}`);

  private _self: UserDocument;
  get self() { return this._self; }

  constructor(private messages = Deps.get<Messages>(Messages)) {
    this.socket.on('connect', () => Log.info('Connected to ws client', 'bot'));
    this.socket.connect();
  }

  async init() {
    this._self = await this.get();

    const channels = await Channel.find({ type: ChannelType.DM, recipientIds: this.self._id });
    const channelIds: string[] = channels.map(d => d._id);
    const guildIds: string[] = [];

    const botMembers = await GuildMember.find({ user: this.self.id });
    for (const member of botMembers) {
      const guild = await Guild.findById(member.guildId);
      guildIds.push(guild.id);

      for (const channel of guild.channels)
        channelIds.push(channel as any);
    }

    this.socket.emit('READY', {
      user: this.self,
      guildIds,
      channelIds
    });

    Log.info('Initialized bot', 'bot');

    this.hookWSEvents();
  }

  private hookWSEvents() {
    this.socket.on('MESSAGE_CREATE', async (message: MessageDocument) => {
      Log.info('GET MESSAGE_CREATE', 'bot');

      message = await this.messages.get(message._id);
      if (!message.guild && message.author.bot) return;

      const prefix = '.';
      if (message.content.startsWith(prefix))
        await this.handleCommand(prefix, message);
    });
  }

  private async handleCommand(prefix: string, message: MessageDocument) {
    const commandName = message.content
      .slice(prefix.length)
      .split(' ')[0];

    if (commandName === 'ping') {
      const from = new Date();
      await fetch(process.env.API_URL);
      const until = new Date();

      const latencyMs = until.getTime() - from.getTime();

      this.socket.emit('MESSAGE_CREATE', {
        author: this.self,
        channel: message.channel,
        content: `🏓 Pong! \`${latencyMs}ms\``,
        guild: message.guild,
      });
    }    
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
        type: ChannelType.DM,
        recipientIds: [user._id, this.self._id]
      });
  }

  async get() {
    return await User.findOne({ username: '2PG' })
      ?? await User.create({
        _id: generateSnowflake(),
        avatarURL: `${process.env.API_URL ?? 'http://localhost:3000'}/avatars/bot.png`,
        badges: [],
        bot: true,
        createdAt: new Date(),
        status: StatusType.Online,
        username: '2PG',
        friends: [],
        friendRequests: [],
        voice: null,
      });
  }

  async addToGuild(guildId: string) {
    const invite = await Invite.create({
      _id: generateInviteCode(),
      createdAt: new Date(),
      expiresAt: null,
      guild: await Guild.findById(guildId),
      inviter: this.self,
      maxUses: 1,
      uses: 0
    });

    this.socket.emit('GUILD_MEMBER_ADD', {
      inviteCode: invite.id,
      user: this.self
    });

    const systemChannel = await Channel.findOne({ guildId, type: ChannelType.Text });
    this.socket.emit('MESSAGE_CREATE', {
      author: this.self,
      channel: systemChannel,
      content: `Hi, I'm **2PG**! 🤖`
    });
  }
}