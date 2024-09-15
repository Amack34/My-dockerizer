import { Command } from 'commander';
import { scanProject, deployDocker, deployKubernetes, deployNginxConfig } from './scanner.mjs';
import readline from 'readline';

// Function to prompt user for input
function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

const program = new Command();

program
  .name('dockerizer')
  .description('CLI tool to create Dockerfiles for projects')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan a project and generate a Dockerfile')
  .argument('<projectPath>', 'Path to the project directory')
  .action(async (projectPath) => {
      // Prompt the user for the Docker image name and tag
      const projectName = await promptUser('Enter the name for the Docker image: ');
      const imageTag = await promptUser('Enter the tag for the Docker image: ');

      console.log(`User entered Docker image name: ${projectName}`);
      console.log(`User entered Docker image tag: ${imageTag}`);

      // Pass the projectName and imageTag to scanProject and wait for it to complete
      await scanProject(projectPath, projectName, imageTag);

      // Ensure the build is completely finished before asking for deployment
      console.log('Docker image build complete.');

      // Prompt the user for deployment options
      const deployOption = await promptUser('Do you want to deploy the image? (yes/no): ');

      if (deployOption.toLowerCase() === 'yes') {
          const deployType = await promptUser('Deploy locally, remotely, to Kubernetes, or with Nginx? (local/remote/k8s/nginx): ');

          if (deployType === 'local') {
              await deployDocker(projectPath, projectName, imageTag);
          } else if (deployType === 'remote') {
              const remoteHost = await promptUser('Enter the remote Docker host: ');
              const remoteUser = await promptUser('Enter the username for the remote host: ');
              const remotePassword = await promptUser('Enter the password for the remote host: ');
              await deployDocker(projectPath, projectName, imageTag, remoteHost, remoteUser, remotePassword);
          } else if (deployType === 'k8s') {
              // Pass the projectPath to deployKubernetes
              await deployKubernetes(projectName, projectPath);
          } else if (deployType === 'nginx') {
              await deployNginxConfig(projectName);
          } else {
              console.log('Invalid deployment option. Skipping deployment.');
          }
      } else {
          console.log('Skipping deployment.');
      }
  });

program.parse(process.argv);