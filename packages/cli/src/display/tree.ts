import chalk from 'chalk';

export interface TreeNode {
  label: string;
  children?: TreeNode[];
  detail?: string;
}

export function renderTree(node: TreeNode, prefix = '', isLast = true): string {
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = prefix + (isLast ? '    ' : '│   ');

  let output = prefix + connector + node.label;
  if (node.detail) {
    output += chalk.dim(` ${node.detail}`);
  }
  output += '\n';

  if (node.children) {
    node.children.forEach((child, i) => {
      const last = i === node.children!.length - 1;
      output += renderTree(child, childPrefix, last);
    });
  }

  return output;
}

export function renderBlastRadiusTree(
  maintainer: string,
  packages: string[],
  projects: string[],
): string {
  const root: TreeNode = {
    label: chalk.bold(maintainer),
    children: [
      {
        label: chalk.yellow(`direct packages (${packages.length})`),
        children: packages.slice(0, 5).map((p) => ({ label: p })),
      },
      {
        label: chalk.dim(`projects exposed (${projects.length})`),
        children: projects.slice(0, 5).map((p) => ({ label: p })),
      },
    ],
  };

  let output = chalk.cyan('Blast radius for: ') + chalk.bold(maintainer) + '\n';
  if (root.children) {
    root.children.forEach((child, i) => {
      const last = i === root.children!.length - 1;
      output += renderTree(child, '', last);
    });
  }
  return output;
}
