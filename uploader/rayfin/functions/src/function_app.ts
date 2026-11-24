import { AudienceType, UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';
import { uploadPdf, type Target } from './upload.js';
import { localTarget } from './target.generated.js';

const udf = new UserDataFunctions();
const target = (): Target | undefined => localTarget;

udf.func('uploaderPolicy', (ctx: RayfinContext): string => {
  const config = target();
  const id = ctx.user?.id ?? '';
  return JSON.stringify({
    id,
    fixtureSha256: config?.allowedUserIds.includes(id) ? config.fixtureSha256 : null,
  });
}, []);

udf.func('storeSyntheticPdf', async (
  ctx: RayfinContext<Record<string, never>, AudienceType.Storage>,
  pdfBase64: string,
): Promise<string> => JSON.stringify(await uploadPdf(target(), ctx.user?.id, pdfBase64, () => ctx.Tokens.Storage)), []);
