import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/quickbooks/export/route';
const m = vi.hoisted(() => ({ role: vi.fn(), read: vi.fn(), save: vi.fn(), fetch: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/quickbooks/server', () => ({ requireQbRole: m.role, adminDb: m.admin, getConnection: async () => ({realm_id:'realm'}), qbFetch:m.fetch, qbApiBase:()=>'' }));
vi.mock('@/lib/work-orders/queries', () => ({ WO_FULL_SELECT:'id', toTotalsInput:()=>({}) }));
vi.mock('@/lib/work-orders/totals', () => ({ computeTotals:()=>({}) }));
vi.mock('@/lib/quickbooks/invoice', () => ({ buildInvoicePayload:()=>({}) }));
const id='00000000-0000-4000-8000-000000000001';
const req=()=>new Request('https://example.com/api/quickbooks/export',{method:'POST',body:JSON.stringify({workOrderId:id})});
beforeEach(()=>{
 vi.clearAllMocks();
 m.role.mockResolvedValue({supabase:{from:()=>({select:()=>({eq:()=>({single:m.read})}),update:()=>({eq:()=>({select:()=>({single:m.save})})})})}});
 m.admin.mockReturnValue({from:()=>{throw new Error('Service role must not read work orders');}});
 m.read.mockResolvedValue({data:{id,customers:{name:'Test customer'}},error:null});
 m.save.mockResolvedValue({data:{id},error:null});
 m.fetch.mockImplementation(async (_db,path:string)=>path.includes('/invoice?')?Response.json({Invoice:{Id:'invoice-1'}}):Response.json({QueryResponse:{Entity:[{Id:'entity-1',Name:'Income'}]}}));
});
it('does not export an out-of-office work order hidden by RLS',async()=>{
 m.read.mockResolvedValue({data:null,error:{message:'not found'}});
 expect((await POST(req())).status).toBe(404); expect(m.fetch).not.toHaveBeenCalled();
});
it('returns the existing invoice without creating a duplicate',async()=>{
 m.read.mockResolvedValue({data:{id,quickbooks_invoice_id:'existing'},error:null});
 expect(await (await POST(req())).json()).toMatchObject({invoiceId:'existing'}); expect(m.fetch).not.toHaveBeenCalled();
});
it('uses a stable invoice request ID and reports a failed local link save',async()=>{
 m.save.mockResolvedValue({data:null,error:{message:'write denied'}});
 const response=await POST(req()); expect(response.status).toBe(502);
 expect(await response.json()).toMatchObject({invoiceId:'invoice-1'});
 expect(m.fetch.mock.calls.find(([,p])=>p.includes('/invoice?'))?.[1]).toContain(`requestid=mt-invoice-${id}`);
});
