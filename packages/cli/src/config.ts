import Conf from 'conf';

export interface CrowsnestConfig {
  apiUrl: string;
  githubToken: string;
  npmToken: string;
  socketApiKey: string;
  anthropicApiKey: string;
  /** Folder on this machine that `crowsnest start` shares with Docker. Set by start and stop, not by hand. */
  sharedFolder: string;
}

const conf = new Conf<CrowsnestConfig>({ projectName: 'crowsnest' });

export function getConfig(): CrowsnestConfig {
  return {
    apiUrl: conf.get('apiUrl', process.env.CROWSNEST_API_URL || 'http://localhost:8000'),
    githubToken: conf.get('githubToken', process.env.GITHUB_TOKEN || ''),
    npmToken: conf.get('npmToken', process.env.NPM_TOKEN || ''),
    socketApiKey: conf.get('socketApiKey', process.env.SOCKET_API_KEY || ''),
    anthropicApiKey: conf.get('anthropicApiKey', process.env.ANTHROPIC_API_KEY || ''),
    sharedFolder: conf.get('sharedFolder', ''),
  };
}

export function setConfig(key: keyof CrowsnestConfig, value: string): void {
  conf.set(key, value);
}

export function getAllConfig(): CrowsnestConfig {
  return getConfig();
}
