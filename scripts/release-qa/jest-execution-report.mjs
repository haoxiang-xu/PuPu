import fs from "node:fs";

const nonnegativeInteger = (value, fieldName) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Jest report ${fieldName} must be a non-negative integer`);
  }
  return value;
};

export const requireNonzeroJestExecution = ({ reportPath, stageName }) => {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    throw new Error(`${stageName} did not produce a readable Jest report: ${error.message}`);
  }

  const executedTests =
    nonnegativeInteger(report.numPassedTests, "numPassedTests") +
    nonnegativeInteger(report.numFailedTests, "numFailedTests");
  const executedSuites =
    nonnegativeInteger(report.numPassedTestSuites, "numPassedTestSuites") +
    nonnegativeInteger(report.numFailedTestSuites, "numFailedTestSuites");
  if (executedTests === 0 || executedSuites === 0) {
    throw new Error(
      `${stageName} executed zero tests or suites; skipped-only output is INCOMPLETE`,
    );
  }
  return Object.freeze({ executedTests, executedSuites });
};
