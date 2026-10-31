import config from '../../../lib/config.js';
import { sites } from '../../../lib/db.js';
import { getAuthedUser } from '../../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody } from '../../../lib/http.js';
import {
  createCnameRecord, updateCnameRecord, deleteDnsRecord,
  createTxtRecord, updateTxtRecord
} from '../../../lib/vercel.js';

const { rootDomain } = config;

const CNAME_REGEX = /^[\w-]+\.vercel-dns(-\w+)?\.com$/i;
const TXT_REGEX = /^vc-domain-verify=[\w.-]+,[a-f0-9]+$/i;

export default async function handler(req, res) {
  noCache(res);
  const uid = await getAuthedUser(req);
  if (!uid) return sendError(res, 401, 'Unauthorized');

  const id = parseInt(req.query.id, 10);
  if (!id || Number.isNaN(id)) return sendError(res, 400, 'Invalid id');

  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID || null;

  try {
    const site = await sites.findById(id);
    if (!site || site.user_id !== uid) return sendError(res, 404, 'Site tidak ditemukan');

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const rawTarget = String(body.target || '').trim().replace(/\.$/, '');
      const rawTxt = String(body.txt_value || '').trim();

      if (!rawTarget) return sendError(res, 400, 'CNAME target wajib diisi');
      if (!CNAME_REGEX.test(rawTarget)) {
        return sendError(res, 400, 'Target harus CNAME Vercel (contoh: abc123.vercel-dns-017.com)');
      }
      if (rawTxt && !TXT_REGEX.test(rawTxt)) {
        return sendError(res, 400, 'Format TXT tidak valid. Contoh: vc-domain-verify=sub.domain.com,abc123');
      }

      // CNAME
      let recordId = site.dns_record_id;
      if (recordId) {
        const upd = await updateCnameRecord({ domain: rootDomain, recordId, name: site.subdomain, target: rawTarget, token, teamId });
        if (upd.error) return sendError(res, upd.status || 500, upd.error);
      } else {
        const crt = await createCnameRecord({ domain: rootDomain, name: site.subdomain, target: rawTarget, token, teamId });
        if (crt.error) {
          if (crt.status === 409) return sendError(res, 409, 'Record CNAME sudah ada di Vercel DNS');
          return sendError(res, crt.status || 500, crt.error);
        }
        recordId = crt.record.uid || crt.record.id || null;
      }

      // TXT (optional)
      let txtRecordId = site.dns_txt_record_id;
      if (rawTxt) {
        const txtName = `_vercel.${site.subdomain}`;
        if (txtRecordId) {
          const upd = await updateTxtRecord({ domain: rootDomain, recordId: txtRecordId, name: txtName, value: rawTxt, token, teamId });
          if (upd.error) return sendError(res, upd.status || 500, upd.error);
        } else {
          const crt = await createTxtRecord({ domain: rootDomain, name: txtName, value: rawTxt, token, teamId });
          if (crt.error) return sendError(res, crt.status || 500, crt.error);
          txtRecordId = crt.record.uid || crt.record.id || null;
        }
      } else if (txtRecordId) {
        await deleteDnsRecord({ domain: rootDomain, recordId: txtRecordId, token, teamId });
        txtRecordId = null;
      }

      const updated = await sites.update(site.id, {
        dns_target: rawTarget,
        dns_record_id: recordId,
        dns_txt_record_id: txtRecordId
      });

      return sendJson(res, 200, {
        site: {
          id: updated.id,
          subdomain: updated.subdomain,
          dns_target: updated.dns_target,
          dns_record_id: updated.dns_record_id,
          dns_txt_record_id: updated.dns_txt_record_id
        }
      });
    }

    if (req.method === 'DELETE') {
      if (site.dns_record_id) {
        await deleteDnsRecord({ domain: rootDomain, recordId: site.dns_record_id, token, teamId });
      }
      if (site.dns_txt_record_id) {
        await deleteDnsRecord({ domain: rootDomain, recordId: site.dns_txt_record_id, token, teamId });
      }
      const updated = await sites.update(site.id, {
        dns_target: null,
        dns_record_id: null,
        dns_txt_record_id: null
      });
      return sendJson(res, 200, {
        site: {
          id: updated.id,
          subdomain: updated.subdomain,
          dns_target: null,
          dns_record_id: null,
          dns_txt_record_id: null
        }
      });
    }

    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('dns error', err);
    sendError(res, 500, 'Internal error');
  }
}