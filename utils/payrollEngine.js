/**
 * Nisi HR - Automated Payroll Calculation Engine
 * Processes individual staff compensation records into legal statutory metrics.
 */

const PAYROLL_CONFIG = {
  NAPSA_RATE: 0.05,
  NAPSA_MAX_CEILING: 1600.00, // Configured for national cap limits
  NHIMA_RATE: 0.01,
  // ZRA Monthly Progressive Tax Brackets
  ZRA_BANDS: [
    { limit: 5100, rate: 0.00 },
    { limit: 2000, rate: 0.20 }, // 7100 - 5100
    { limit: 2100, rate: 0.30 }, // 9200 - 7100
    { rate: 0.37 }               // Above 9200
  ]
};

const calculateEmployeePayroll = (employee) => {
  const basicSalary = Number(employee.compensation?.basicSalary || 0);
  const allowancesObj = employee.compensation?.allowances || {};
  
  // 1. Calculate Total Allowances
  const totalAllowances = Object.values(allowancesObj).reduce((sum, val) => sum + Number(val || 0), 0);
  
  // 2. Compute Gross Pay
  const grossPay = basicSalary + totalAllowances;

  // 3. Compute NAPSA Deduction (5% of Gross, capped at ceiling)
  let napsaDeduction = grossPay * PAYROLL_CONFIG.NAPSA_RATE;
  if (napsaDeduction > PAYROLL_CONFIG.NAPSA_MAX_CEILING) {
    napsaDeduction = PAYROLL_CONFIG.NAPSA_MAX_CEILING;
  }

  // 4. Compute NHIMA Deduction (1% of Basic Salary)
  const nhimaDeduction = basicSalary * PAYROLL_CONFIG.NHIMA_RATE;

  // 5. Compute ZRA PAYE (Taxable Income = Gross Pay - NAPSA Deduction)
  const taxableIncome = Math.max(0, grossPay - napsaDeduction);
  let payeTax = 0;
  let remainingIncome = taxableIncome;

  // Step through the progressive tax tiers smoothly
  // Band 1: 0% Tax Tier
  const band1Amount = Math.min(remainingIncome, PAYROLL_CONFIG.ZRA_BANDS[0].limit);
  remainingIncome -= band1Amount;

  // Band 2: 20% Tax Tier
  if (remainingIncome > 0) {
    const band2Amount = Math.min(remainingIncome, PAYROLL_CONFIG.ZRA_BANDS[1].limit);
    payeTax += band2Amount * PAYROLL_CONFIG.ZRA_BANDS[1].rate;
    remainingIncome -= band2Amount;
  }

  // Band 3: 30% Tax Tier
  if (remainingIncome > 0) {
    const band3Amount = Math.min(remainingIncome, PAYROLL_CONFIG.ZRA_BANDS[2].limit);
    payeTax += band3Amount * PAYROLL_CONFIG.ZRA_BANDS[2].rate;
    remainingIncome -= band3Amount;
  }

  // Band 4: 37% Tax Tier (The remaining balance)
  if (remainingIncome > 0) {
    payeTax += remainingIncome * PAYROLL_CONFIG.ZRA_BANDS[3].rate;
  }

  // 6. Calculate Net Take-Home Pay
  const totalDeductions = payeTax + napsaDeduction + nhimaDeduction;
  const netPay = grossPay - totalDeductions;

  // Round values to 2 decimal places to maintain currency precision
  return {
    grossPay: Number(grossPay.toFixed(2)),
    netPay: Number(netPay.toFixed(2)),
    deductions: {
      paye: Number(payeTax.toFixed(2)),
      napsa: Number(napsaDeduction.toFixed(2)),
      nhima: Number(nhimaDeduction.toFixed(2)),
      totalDeductions: Number(totalDeductions.toFixed(2))
    },
    meta: {
      taxableIncome: Number(taxableIncome.toFixed(2)),
      totalAllowances: Number(totalAllowances.toFixed(2))
    }
  };
};

export default calculateEmployeePayroll;