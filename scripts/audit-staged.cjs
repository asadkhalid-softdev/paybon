// Review staged bytes only. Findings report locations, never credential values.
const cp=require('node:child_process');
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024});
const files=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean);
const ignored=git(['ls-files','--cached','--ignored','--exclude-standard','-z']).split('\0').filter(Boolean);
const patterns=[
  ['private key',/-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/g],
  ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['cloud access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Google API key',/\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['JWT',/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['Slack token',/\bxox[baprs]-[A-Za-z0-9-]{15,}\b/g],
  ['literal credential',/["']?(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)["']?\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi],
  ['personal account link',/[?&](?:userid|customerId|cardNumber|sessionId|access_token|refresh_token)=[A-Za-z0-9._-]{8,}/gi],
  ['local personal path',/[A-Z]:[\\/](?:Users|My Data)[\\/]/g],
];
let findings=0;
for(const file of ignored){console.error(`${file}: ignored file is present in the index`);findings++;}
for(const file of files){
  const bytes=cp.execFileSync('git',['show',`:${file}`],{maxBuffer:16*1024*1024});
  if(bytes.includes(0))continue;
  const text=bytes.toString('utf8');
  for(const [category,pattern]of patterns){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern)){
      if(category==='literal credential'&&/^(?:test|example|dummy|placeholder)[-_ ]/i.test(match[1]))continue;
      console.error(`${file}:${text.slice(0,match.index).split('\n').length}: possible ${category}`);findings++;
    }
  }
}
if(findings){console.error(`${findings} finding(s) require review.`);process.exitCode=1;}
else console.log(`Reviewed ${files.length} staged files: no known credential patterns or ignored files found. This is a pattern check, not a guarantee.`);
