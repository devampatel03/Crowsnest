import evil from 'evil-pkg';
import meh from 'meh-pkg';
import lowish from 'lowish-pkg';
import safe from 'safe-pkg';
import fs from 'fs';
import path from 'node:path';
import { spawn } from 'child_process';
import local from './local';

export const used = [evil, meh, lowish, safe, fs, path, spawn, local];
