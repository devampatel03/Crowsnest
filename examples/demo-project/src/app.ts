// Open this file in VS Code with the Crowsnest extension to see inline warnings.
import express from 'express';
import axios from 'axios';
import _ from 'lodash';
import { codeshift } from 'react-codeshift';        // AI-suggested name, not a package anyone should trust
import { chunkSmart } from 'lodash-helper-utils';    // plausible name, no real author behind it
import { QueryClient } from '@tanstack/query-core';  // on the sample compromised-package list
import expresss from 'expresss';                 // one letter off express

const app = express();
app.get('/', async (_req, res) => {
  const { data } = await axios.get('https://example.com');
  res.send(_.chunk([data, codeshift, chunkSmart, QueryClient, expresss], 2));
});
app.listen(3000);
