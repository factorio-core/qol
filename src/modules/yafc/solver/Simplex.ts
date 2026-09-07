export interface SimplexConstraint {
  /** Coefficients for each decision variable x_0 .. x_{n-1} */
  coefficients: number[];
  /** Equality or inequality relation */
  relation: '==' | '>=' | '<=';
  /** Right-hand side scalar constant */
  rhs: number;
}

export interface SimplexProblem {
  /** Number of primary decision variables (recipes) */
  numVariables: number;
  /** Objective cost coefficients to minimize (c^T * x) */
  objectiveCoefficients: number[];
  /** System of linear constraints */
  constraints: SimplexConstraint[];
  /** Optional per-variable upper bounds */
  variableUpperBounds?: number[];
}

export interface SimplexResult {
  /** True if a feasible solution satisfying all constraints exists */
  feasible: boolean;
  /** True if the optimal solution was reached (not unbounded or infeasible) */
  optimal: boolean;
  /** Value of the objective function at optimum (c^T * x) */
  objectiveValue: number;
  /** Solved values for primary decision variables x_0 .. x_{n-1} */
  solution: number[];
}

/** Numerical threshold for zero tests and pivot selection to prevent floating point drift */
const EPSILON = 1e-7;

interface NormalizedConstraint {
  coefficients: number[];
  relation: '==' | '>=' | '<=';
  rhs: number;
}

export class SimplexSolver {
  /**
   * Solves standard canonical LP problems for Factorio production graphs via Two-Phase Simplex:
   * - Phase 1: Finds a feasible basic solution driving artificial variables to zero using Dantzig pivots.
   * - Phase 2: Optimizes the primary objective (min sum c_i * x_i) along the polytope edges.
   */
  public static solve(problem: SimplexProblem): SimplexResult {
    const numVars = problem.numVariables;
    const rawConstraints = problem.constraints;
    const numConstraints = rawConstraints.length;

    if (numVars === 0 || numConstraints === 0) {
      return { feasible: true, optimal: true, objectiveValue: 0, solution: [] };
    }

    // =========================================================================
    // Step 1: Normalize constraints so all RHS >= 0
    // If rhs < 0, multiply the whole equation by -1 and invert inequality.
    // =========================================================================
    const constraints: NormalizedConstraint[] = [];
    for (let i = 0; i < numConstraints; i++) {
      const c = rawConstraints[i];
      if (c.rhs < 0) {
        let newRel: '==' | '>=' | '<=' = c.relation;
        if (c.relation === '<=') newRel = '>=';
        else if (c.relation === '>=') newRel = '<=';

        const newCoeffs: number[] = [];
        for (const v of c.coefficients) {
          newCoeffs.push(-v);
        }
        constraints.push({
          coefficients: newCoeffs,
          relation: newRel,
          rhs: -c.rhs,
        });
      } else {
        constraints.push({
          coefficients: c.coefficients,
          relation: c.relation,
          rhs: c.rhs,
        });
      }
    }

    // =========================================================================
    // Step 2: Convert constraints to standard equality form:
    // - '<=' adds a Slack variable (+s_i)
    // - '>=' adds a Surplus variable (-s_i) and Artificial variable (+a_i)
    // - '==' adds an Artificial variable (+a_i)
    // =========================================================================
    let totalColumns = numVars;
    const artificialIndices: number[] = [];
    const basis: number[] = [];

    // Count extra variables and assign initial basis
    for (let i = 0; i < numConstraints; i++) {
      const c = constraints[i];
      if (c.relation === '<=') {
        basis.push(totalColumns);
        totalColumns += 1; // Slack variable
      } else if (c.relation === '>=') {
        totalColumns += 1; // Surplus variable
        artificialIndices.push(totalColumns);
        basis.push(totalColumns);
        totalColumns += 1; // Artificial variable
      } else if (c.relation === '==') {
        artificialIndices.push(totalColumns);
        basis.push(totalColumns);
        totalColumns += 1; // Artificial variable
      }
    }

    const tableauRows = numConstraints + 2; // +1 for Phase 2 obj, +1 for Phase 1 obj
    const tableauCols = totalColumns + 1; // +1 for RHS

    // Initialize 2D tableau as flat array for Lua performance
    const tableau: number[][] = [];
    for (let r = 0; r < tableauRows; r++) {
      const row: number[] = [];
      for (let c = 0; c < tableauCols; c++) {
        row.push(0);
      }
      tableau.push(row);
    }

    // =========================================================================
    // Step 3: Populate tableau matrix
    // Row 0 .. (numConstraints - 1): constraint coefficients & RHS
    // =========================================================================
    let extraVarOffset = numVars;
    for (let i = 0; i < numConstraints; i++) {
      const c = constraints[i];
      tableau[i][tableauCols - 1] = c.rhs;

      for (let v = 0; v < numVars; v++) {
        tableau[i][v] = c.coefficients[v];
      }

      if (c.relation === '<=') {
        tableau[i][extraVarOffset] = 1; // Slack
        extraVarOffset += 1;
      } else if (c.relation === '>=') {
        tableau[i][extraVarOffset] = -1; // Surplus
        extraVarOffset += 1;
        tableau[i][extraVarOffset] = 1; // Artificial
        extraVarOffset += 1;
      } else if (c.relation === '==') {
        tableau[i][extraVarOffset] = 1; // Artificial
        extraVarOffset += 1;
      }
    }

    // Phase 2 Objective (Minimize c^T * x -> in maximization tableau: -c)
    const phase2Row = numConstraints;
    for (let v = 0; v < numVars; v++) {
      tableau[phase2Row][v] = -problem.objectiveCoefficients[v];
    }

    // =========================================================================
    // Step 4: Phase 1 Simplex (Eliminate artificial variables)
    // Minimizes w = sum(artificial vars). Feasible iff w == 0 at termination.
    // =========================================================================
    const phase1Row = numConstraints + 1;
    const hasArtificial = artificialIndices.length > 0;

    if (hasArtificial) {
      for (const artCol of artificialIndices) {
        tableau[phase1Row][artCol] = -1;
      }

      // Eliminate artificial variables from Phase 1 objective row to express in terms of non-basic vars
      for (let i = 0; i < numConstraints; i++) {
        const c = constraints[i];
        if (c.relation === '>=' || c.relation === '==') {
          for (let col = 0; col < tableauCols; col++) {
            tableau[phase1Row][col] += tableau[i][col];
          }
        }
      }

      // Run Phase 1 Simplex pivots
      SimplexSolver.runTableauPhase(tableau, basis, phase1Row, numConstraints, tableauCols);

      // Check Phase 1 feasibility: sum of artificial vars must be ~ 0
      const phase1OptimalValue = tableau[phase1Row][tableauCols - 1];
      if (Math.abs(phase1OptimalValue) > 1e-4) {
        // Problem is mathematically infeasible (cannot satisfy all targets/balance)
        const emptySol: number[] = [];
        for (let v = 0; v < numVars; v++) {
          emptySol.push(0);
        }
        return {
          feasible: false,
          optimal: false,
          objectiveValue: 0,
          solution: emptySol,
        };
      }
    }

    // =========================================================================
    // Step 5: Phase 2 Simplex (Optimize primary objective)
    // Eliminate basic variables from Phase 2 objective row
    // =========================================================================
    for (let i = 0; i < numConstraints; i++) {
      const basicCol = basis[i];
      const factor = tableau[phase2Row][basicCol];
      if (Math.abs(factor) > EPSILON) {
        for (let col = 0; col < tableauCols; col++) {
          tableau[phase2Row][col] -= factor * tableau[i][col];
        }
      }
    }

    // Run Phase 2 Simplex pivots
    SimplexSolver.runTableauPhase(tableau, basis, phase2Row, numConstraints, tableauCols);

    // =========================================================================
    // Step 6: Extract solutions for primary decision variables x_0 .. x_{n-1}
    // =========================================================================
    const solution: number[] = [];
    for (let v = 0; v < numVars; v++) {
      solution.push(0);
    }

    for (let i = 0; i < numConstraints; i++) {
      const basicCol = basis[i];
      if (basicCol < numVars) {
        solution[basicCol] = Math.max(0, tableau[i][tableauCols - 1]);
      }
    }

    const objValue = -tableau[phase2Row][tableauCols - 1];

    return {
      feasible: true,
      optimal: true,
      objectiveValue: objValue,
      solution,
    };
  }

  /**
   * Executes Dantzig's Pivot iterations on the Simplex tableau for a given objective row.
   */
  private static runTableauPhase(tableau: number[][], basis: number[], objRowIndex: number, numConstraints: number, tableauCols: number): void {
    const maxIterations = 200;
    let iter = 0;

    while (iter++ < maxIterations) {
      // Find entering column (Dantzig's rule: most positive value in maximization tableau row)
      let enterCol = -1;
      let maxVal = EPSILON;

      for (let c = 0; c < tableauCols - 1; c++) {
        if (tableau[objRowIndex][c] > maxVal) {
          maxVal = tableau[objRowIndex][c];
          enterCol = c;
        }
      }

      if (enterCol === -1) {
        break; // Optimal reached
      }

      // Find leaving row (Minimum ratio test)
      let leaveRow = -1;
      let minRatio = 1e30;

      for (let r = 0; r < numConstraints; r++) {
        const coeff = tableau[r][enterCol];
        if (coeff > EPSILON) {
          const ratio = tableau[r][tableauCols - 1] / coeff;
          if (ratio < minRatio) {
            minRatio = ratio;
            leaveRow = r;
          }
        }
      }

      if (leaveRow === -1) {
        break; // Unbounded
      }

      // Perform Pivot on (leaveRow, enterCol)
      const pivotVal = tableau[leaveRow][enterCol];
      basis[leaveRow] = enterCol;

      // Normalize pivot row
      for (let c = 0; c < tableauCols; c++) {
        tableau[leaveRow][c] /= pivotVal;
      }

      // Eliminate from all other rows
      const totalRows = tableau.length;
      for (let r = 0; r < totalRows; r++) {
        if (r !== leaveRow) {
          const factor = tableau[r][enterCol];
          if (Math.abs(factor) > EPSILON) {
            for (let c = 0; c < tableauCols; c++) {
              tableau[r][c] -= factor * tableau[leaveRow][c];
            }
          }
        }
      }
    }
  }
}
