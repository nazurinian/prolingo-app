import { execFileSync } from 'node:child_process';
export const assertTextUatBuild = ({ mode, env, branch }) => {
  if (mode !== 'text-uat') return false;
  if (env.VITE_ENABLE_TEXT_UAT !== 'true') throw Error('UAT build requires explicit VITE_ENABLE_TEXT_UAT=true');
  if (env.VERCEL === '1') {
    if (env.VERCEL_ENV !== 'preview') throw Error('UAT builds require Vercel Preview environment');
    if (env.VERCEL_GIT_COMMIT_REF !== 'test/text-v2-uat' || env.TEXT_UAT_PROJECT !== 'prolingo-app') throw Error('UAT enabled builds require Vercel branch test/text-v2-uat and TEXT_UAT_PROJECT=prolingo-app');
  } else if (branch !== 'test/text-v2-uat') throw Error('Local UAT builds require test/text-v2-uat');
  return true;
};
export const publicTextUatMetadata = () => ({
  version: '6.0.3-beta.9-uat.1', label: 'ProLingo Text v2 UAT', channel: 'Isolated Beta Testing',
  sha: /^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || '')
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8) : execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim(),
  builtAt: new Date().toISOString()
});
