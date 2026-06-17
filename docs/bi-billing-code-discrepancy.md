# Billing Code Discrepancy — Behavioral Intervention Individual
**Status:** Open — requires billing/clinical team approval before beta  
**Date raised:** 2026-06-17  
**Raised by:** Engineering (code audit of In Development build)

---

## Summary

Two service line modules in the application (**Children's DDA** and **School-Based Services**) use billing code **H2014** for Behavioral Intervention Individual services. The master Idaho Medicaid rate catalog in the codebase assigns billing code **H0004** to those same services. One of these is wrong. Submitting claims with the incorrect code will result in denials.

This document lays out the discrepancy in full so billing and clinical leadership can confirm the correct code before the beta deployment is finalized.

---

## The Discrepancy

### What the master rate catalog says (`idahoRates.js`)

The application's central Idaho Medicaid fee schedule defines codes as follows for `CHILDRENS_DDA`:

| Code | Modifier | Description | Rate |
|------|----------|-------------|------|
| **H2014** | *(none)* | Habilitative Skill Building — Individual | $13.54 |
| **H2014** | HQ | Habilitative Skill Building — Group | $5.41 |
| **H0004** | HA | Behavioral Intervention Individual — Technician | $13.54 |
| **H0004** | HN | Behavioral Intervention Individual — Specialist | $15.48 |
| **H0004** | HO | Behavioral Intervention Individual — Professional | $21.34 |
| **H0004** | EBM | Behavioral Intervention Individual — EBM Paraprofessional | $14.34 |
| **H0004** | TF | Behavioral Intervention Individual — EBM Specialist | $18.51 |
| **H0004** | TG | Behavioral Intervention Individual — EBM Professional | $24.68 |

Per this source: H2014 = Skill Building. H0004 = Behavioral Intervention Individual.

---

### What the Children's DDA and School-Based service line modules use

Both `childrens_dda.jsx` and `school_based.jsx` define their own internal rate tables. Both attribute the codes to the "Children's DDA CHIS schedule, post-9/1/2025" and use the following:

| Code | Modifier | Description | Rate |
|------|----------|-------------|------|
| **H2014** | HA | Behavioral Intervention Individual — Technician | $13.54 |
| **H2014** | HN | Behavioral Intervention Individual — Specialist | $15.48 |
| **H2014** | HO | Behavioral Intervention Individual — Professional | $21.34 |
| **H2014** | TF | Behavioral Intervention Individual — EBM Paraprofessional | $14.34 |
| **H2014** | TF HN | Behavioral Intervention Individual — EBM Specialist | $18.51 |
| **H2014** | TF HO | Behavioral Intervention Individual — EBM Professional | $24.68 |

Per these modules: H2014 is used for both Skill Building **and** Behavioral Intervention Individual.

---

## Second Discrepancy — EBM Modifier Values

The EBM-tier modifiers differ between the two sources as well:

| Tier | Master catalog modifier | Service line module modifier |
|------|------------------------|------------------------------|
| EBM Paraprofessional | `EBM` | `TF` |
| EBM Specialist | `TF` | `TF HN` |
| EBM Professional | `TG` | `TF HO` |

Both the code and the modifier affect how claims are adjudicated. If the modifier is wrong, claims will be rejected even if the service code is correct.

---

## Rates Are Consistent

The dollar rates are identical across all three sources (master catalog, Children's DDA module, School-Based module). The discrepancy is **code and modifier only**, not rate amounts.

---

## Possible Explanations

1. **H2014 is correct for CHIS-billed services; H0004 is correct for standard Medicaid.** Idaho may use different codes depending on the funding stream (CHIS vs traditional fee-for-service Medicaid). If Children's DDA and School-Based services bill through a separate CHIS pathway, H2014 may be intentionally different from the master catalog.

2. **The service line modules are wrong.** When the Children's DDA module was first built, H2014 may have been used by mistake (confusing Skill Building with Behavioral Intervention). The master catalog reflects the correct Idaho Medicaid fee schedule, and the modules should be updated to H0004.

3. **The master catalog is wrong.** The master catalog may have been populated from a general Medicaid fee schedule that does not apply to Children's DDA CHIS services. The service line modules, sourced directly from the CHIS schedule document, may be correct.

---

## What We Need from Billing / Clinical Leadership

Please review the Idaho Medicaid and/or CHIS rate schedule documents and confirm:

1. **Which billing code is correct for Behavioral Intervention Individual in Children's DDA and School-Based contexts?**
   - H2014 (as used in the service line modules), or
   - H0004 (as used in the master rate catalog)

2. **Which EBM modifier set is correct?**
   - `EBM` / `TF` / `TG` (master catalog), or
   - `TF` / `TF HN` / `TF HO` (service line modules)

3. **Are the codes the same for Children's DDA and School-Based Services, or do they differ by program?**

---

## Impact if Not Resolved Before Beta

The financial modeling tool uses these codes for rate lookups and financial projections — the rates are the same regardless of which code is shown, so **financial projections are not affected**. However, if the application is ever used to generate or inform actual claims submissions, claims built from the service line modules would reference the wrong code and be denied.

For beta (internal stakeholder testing of financial projections only), this is a **display and documentation risk**, not an immediate billing risk. It must be resolved before any claim-level integration is built.

---

## Files Affected

| File | Location |
|------|----------|
| Master rate catalog | `src/data/idahoRates.js` lines 145–170 |
| Children's DDA module | `src/serviceLines/childrens_dda.jsx` lines 10–23 |
| School-Based module | `src/serviceLines/school_based.jsx` lines 16–22 |
