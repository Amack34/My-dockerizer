import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import xml2js from 'xml2js'; // For parsing pom.xml
import { exec } from 'child_process';
import chalk from 'chalk'; // For colorful terminal output
import yaml from 'js-yaml'; // For working with YAML files

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log function to log to both console and file
async function log(message) {
    console.log(message);
    await fs.appendFile('scan_project_log.txt', `${new Date().toISOString()} - ${message}\n`);
}

// Function to parse pom.xml for Java projects
async function parsePomXml(pomFilePath) {
    await log(`Starting to parse pom.xml at: ${pomFilePath}`); // Logging
    const pomXml = await fs.readFile(pomFilePath, 'utf-8');
    const parser = new xml2js.Parser();

    parser.parseString(pomXml, (err, result) => {
        if (err) {
            log('Error parsing pom.xml: ' + err);
            return;
        }

        const dependencies = result.project.dependencies[0].dependency.map(dep => ({
            groupId: dep.groupId[0],
            artifactId: dep.artifactId[0],
            version: dep.version[0]
        }));

        log('Parsed dependencies from pom.xml: ' + JSON.stringify(dependencies));
    });
}

// Function to parse Gemfile for Ruby projects
function parseGemfile(gemfileContent) {
    log('Starting to parse Gemfile...'); // Logging
    const dependencies = gemfileContent.split('\n').filter(line => line.startsWith('gem')).map(line => {
        const parts = line.split(/[',]/);
        return {
            name: parts[1].trim(),
            version: parts[2].trim()
        };
    });

    log('Parsed dependencies from Gemfile: ' + JSON.stringify(dependencies));
}

// Updated function to find a file with case-insensitive search
async function findFileRecursively(directory, fileName) {
    const files = await fs.readdir(directory);
    const lowerFileName = fileName.toLowerCase();

    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            const foundPath = await findFileRecursively(fullPath, fileName);
            if (foundPath) return foundPath;
        } else if (file.toLowerCase() === lowerFileName) {
            return fullPath;
        }
    }
    return null;
}

// Function to analyze package.json and index.js for Node.js projects
async function analyzeNodeProject(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const indexJsPath = path.join(projectPath, 'index.js');
    
    let packageJsonData = {};
    let indexJsContent = '';

    // Read package.json if it exists
    if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
        packageJsonData = JSON.parse(packageJson);
    } else {
        await log('No package.json found.');
    }

    // Read index.js if it exists
    if (await fs.pathExists(indexJsPath)) {
        indexJsContent = await fs.readFile(indexJsPath, 'utf-8');
    } else {
        await log('No index.js found.');
    }

    return { packageJsonData, indexJsContent };
}

// Function to generate or modify Dockerfile based on project analysis
async function generateDockerfile(projectType, projectPath) {
    const existingDockerfilePath = path.join(projectPath, 'Dockerfile');

    if (await fs.pathExists(existingDockerfilePath)) {
        await log('Existing Dockerfile found, skipping generation.');
        return existingDockerfilePath;
    }

    await log(`Generating Dockerfile for project type: ${projectType}`);

    let dockerfileContent = '';
    try {
        if (projectType === 'nodejs') {
            await log('Analyzing Node.js project...');
            const { packageJsonData, indexJsContent } = await analyzeNodeProject(projectPath);

            // Load the Node.js Dockerfile template
            const templatePath = path.join(__dirname, '../templates/nodejs.Dockerfile');
            dockerfileContent = await fs.readFile(templatePath, 'utf-8');

            // Modify Dockerfile based on package.json contents
            if (packageJsonData.dependencies) {
                await log(`Dependencies found: ${JSON.stringify(packageJsonData.dependencies)}`);
                if (packageJsonData.dependencies['express']) {
                    dockerfileContent = dockerfileContent.replace('EXPOSE 3000', 'EXPOSE 8000');
                    dockerfileContent = dockerfileContent.replace('CMD ["npm", "start"]', 'CMD ["node", "index.js"]');
                }
            }

            // Modify Dockerfile based on index.js contents
            if (indexJsContent.includes('app.listen(8000)')) {
                await log('Port 8000 detected in index.js.');
                dockerfileContent = dockerfileContent.replace('EXPOSE 3000', 'EXPOSE 8000');
            }

        } else {
            const templatePath = path.join(__dirname, `../templates/${projectType}.Dockerfile`);
            dockerfileContent = await fs.readFile(templatePath, 'utf-8');
        }

        await log('Writing the customized Dockerfile...');
        await fs.writeFile(existingDockerfilePath, dockerfileContent.trim());
        await log(`Dockerfile generated at ${existingDockerfilePath}`);
    } catch (err) {
        await log(`Failed to generate Dockerfile: ${err.message}`);
        throw err;
    }

    return existingDockerfilePath;
}

// Function to scan the entire directory and list all files and folders
async function scanEntireDirectory(directory) {
    if (!directory || typeof directory !== 'string') {
        throw new Error(`Invalid directory path: ${directory}`);
    }

    let allFiles = [];
    const files = await fs.readdir(directory);

    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            const subFiles = await scanEntireDirectory(fullPath);
            allFiles = allFiles.concat(subFiles);
        } else {
            allFiles.push(fullPath);
        }
    }

    return allFiles;
}

// Function to scan for all YAML files and classify them as service or deployment
async function scanYAMLFiles(directory) {
    if (!directory || typeof directory !== 'string') {
        throw new Error(`Invalid directory path: ${directory}`);
    }

    const allFiles = await scanEntireDirectory(directory);
    const serviceYAMLs = [];
    const deploymentYAMLs = [];

    allFiles.forEach(file => {
        if (typeof file !== 'string') {
            return; // Skip invalid entries
        }
        if (file.endsWith('service.yaml')) {
            serviceYAMLs.push(file);
        } else if (file.endsWith('deployment.yaml')) {
            deploymentYAMLs.push(file);
        }
    });

    return { serviceYAMLs, deploymentYAMLs };
}

// Function to build Docker image based on the Dockerfile
async function buildDockerImage(projectPath, projectName, imageTag) {
    await log(`Starting Docker image build for project: ${projectName} with tag: ${imageTag}`); 

    try {
        const dockerfilePath = await findFileRecursively(projectPath, 'Dockerfile');
        if (!dockerfilePath) {
            throw new Error('Dockerfile not found in project directory');
        }

        const buildContext = path.dirname(dockerfilePath);
        await log(`Using Dockerfile located at: ${dockerfilePath}`);
        await log(`Using build context: ${buildContext}`);

        const buildCommand = `docker build -t ${projectName}:${imageTag} ${buildContext}`;

        await new Promise((resolve, reject) => {
            const buildProcess = exec(buildCommand);

            buildProcess.stdout.on('data', (data) => {
                process.stdout.write(data);
            });

            buildProcess.stderr.on('data', (data) => {
                process.stderr.write(data);
            });

            buildProcess.on('exit', (code) => {
                if (code === 0) {
                    log(`Docker image '${projectName}:${imageTag}' built successfully.`);
                    resolve();
                } else {
                    log(`Docker build failed with exit code ${code}.`);
                    reject(new Error(`Docker build failed with exit code ${code}`));
                }
            });
        });

    } catch (err) {
        await log(`Failed to build Docker image for ${projectName}:${imageTag}: ${err.message}`);
        throw err;
    }
}

// Function to deploy Docker image to local or remote Docker environment
async function deployDocker(projectPath, projectName, imageTag, remote = null, user = null, password = null) {
    try {
        const command = remote
            ? `ssh ${user}@${remote} "docker run -d -p 8000:8000 ${projectName}:${imageTag}"`
            : `docker run -d -p 8000:8000 ${projectName}:${imageTag}`;

        await log(`Deploying with command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                log(`Error deploying Docker image: ${stderr}`);
                throw error;
            } else {
                log(`Docker image deployed successfully. Output: ${stdout}`);
            }
        });
    } catch (err) {
        await log(`Failed to deploy Docker image: ${err.message}`);
        throw err;
    }
}

// Function to generate Kubernetes YAML files
async function generateKubernetesYAML(projectName, imageTag) {
    const deploymentYAML = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${projectName}-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${projectName}
  template:
    metadata:
      labels:
        app: ${projectName}
    spec:
      containers:
      - name: ${projectName}
        image: ${projectName}:${imageTag}
        ports:
        - containerPort: 80
`;

    const serviceYAML = `
apiVersion: v1
kind: Service
metadata:
  name: ${projectName}-service
spec:
  selector:
    app: ${projectName}
  type: NodePort
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
`;

    await fs.writeFile(path.join(process.cwd(), `${projectName}-deployment.yaml`), deploymentYAML.trim());
    await fs.writeFile(path.join(process.cwd(), `${projectName}-service.yaml`), serviceYAML.trim());

    await log('Generated Kubernetes YAML files for Deployment and Service.');
}

// Function to update the image in web-deployment.yaml based on the project name and tag
async function updateWebDeploymentImage(projectPath, projectName, imageTag) {
    const webDeploymentPath = path.join(projectPath, 'web-deployment.yaml');

    try {
        // Read the YAML file
        const fileContents = await fs.readFile(webDeploymentPath, 'utf-8');
        const deploymentYaml = yaml.load(fileContents);

        // Get the container(s) from the deployment
        const containers = deploymentYaml.spec.template.spec.containers;

        // Loop through containers and update the image for each one
        for (let container of containers) {
            const oldImage = container.image;  // Capture the old image
            const newImage = `${projectName}:${imageTag}`;  // Construct the new image

            container.image = newImage;  // Update the image
            container.imagePullPolicy = 'IfNotPresent';  // Set the image pull policy to use local images if available

            await log(`Updated image from ${oldImage} to ${newImage} in web-deployment.yaml`);
        }

        // Convert back to YAML and save the updated file
        const updatedYaml = yaml.dump(deploymentYaml);
        await fs.writeFile(webDeploymentPath, updatedYaml, 'utf-8');

        await log(`Updated web-deployment.yaml with new image: ${projectName}:${imageTag}`);
    } catch (error) {
        await log(`Error updating web-deployment.yaml: ${error.message}`);
        throw error;
    }
}

// Function to wait for pods to become ready
async function waitForPodsReady(namespace = 'default', timeout = 300) {
    const spinner = ora('Waiting for pods to become ready...').start();
    const startTime = Date.now();
    let allPodsReady = false;

    while ((Date.now() - startTime) / 1000 < timeout) {
        try {
            const podsOutput = await new Promise((resolve, reject) => {
                exec(`kubectl get pods -n ${namespace}`, (error, stdout, stderr) => {
                    if (error) {
                        reject(stderr);
                    } else {
                        resolve(stdout);
                    }
                });
            });

            const lines = podsOutput.split('\n');
            allPodsReady = true;

            for (const line of lines.slice(1)) { // Skip the header line
                if (line.trim() === '') continue;
                const columns = line.split(/\s+/);
                const podName = columns[0];
                const podStatus = columns[2];
                if (podStatus !== 'Running') {
                    allPodsReady = false;
                    spinner.text = `Waiting for pod ${podName} to be running (current status: ${podStatus})...`;
                    break;
                }
            }

            if (allPodsReady) {
                spinner.succeed('All pods are running.');
                return;
            }

        } catch (error) {
            spinner.fail('Error while checking pod status.');
            await log(`Error while waiting for pods: ${error}`);
            throw new Error(error);
        }

        // Wait for a few seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    spinner.fail(`Pods did not become ready within ${timeout} seconds.`);
    throw new Error('Timeout waiting for pods to become ready.');
}

// Function to deploy Docker image to Kubernetes
async function deployKubernetes(projectName, projectPath) {
    const spinner = ora('Deploying to Kubernetes...').start();

    try {
        if (!projectPath || typeof projectPath !== 'string') {
            throw new Error('projectPath is undefined or invalid.');
        }

        // Update the web-deployment.yaml image tag before applying it
        await updateWebDeploymentImage(projectPath, projectName, 'latest');

        await log(`Starting deployment to Kubernetes for project: ${projectName} at path: ${projectPath}`);
        const { serviceYAMLs, deploymentYAMLs } = await scanYAMLFiles(projectPath);

        // Log the scanned YAMLs for debugging purposes
        await log(`Service YAMLs found: ${JSON.stringify(serviceYAMLs)}`);
        await log(`Deployment YAMLs found: ${JSON.stringify(deploymentYAMLs)}`);

        // Generate Kubernetes YAML files if none are found
        if (serviceYAMLs.length === 0 && deploymentYAMLs.length === 0) {
            await log('No Kubernetes YAML files found. Generating default YAML files...');
            await generateKubernetesYAML(projectName, 'latest');
            serviceYAMLs.push(path.join(process.cwd(), `${projectName}-service.yaml`));
            deploymentYAMLs.push(path.join(process.cwd(), `${projectName}-deployment.yaml`));
        }

        // Apply Deployment YAMLs first
        for (const deploymentYAML of deploymentYAMLs) {
            if (!deploymentYAML || typeof deploymentYAML !== 'string') {
                await log('Deployment YAML is undefined or empty. Skipping...');
                continue;
            }

            const deploymentFilePath = path.resolve(deploymentYAML);
            await log(`Applying deployment YAML: ${deploymentFilePath}`);

            const fileExists = await fs.pathExists(deploymentFilePath);
            if (!fileExists) {
                await log(`Deployment YAML file does not exist: ${deploymentFilePath}`);
                continue;
            }

            spinner.text = `Applying deployment YAML: ${deploymentFilePath}`;
            // Execute the kubectl apply command
            await new Promise((resolve, reject) => {
                exec(`kubectl apply -f "${deploymentFilePath}"`, async (error, stdout, stderr) => {
                    if (error) {
                        await log(`Error applying deployment YAML file ${deploymentFilePath}: ${stderr}`);
                        spinner.fail(`Failed to apply deployment: ${stderr}`);
                        return reject(error);
                    }
                    await log(`Deployment YAML applied successfully: ${deploymentFilePath}`);
                    await log(`Deployment applied: ${stdout}`);
                    spinner.succeed(`Deployment applied: ${deploymentFilePath}`);
                    resolve();
                });
            });
        }

        // Apply Service YAMLs afterwards
        for (const serviceYAML of serviceYAMLs) {
            if (!serviceYAML || typeof serviceYAML !== 'string') {
                await log('Service YAML is undefined or empty. Skipping...');
                continue;
            }

            const serviceFilePath = path.resolve(serviceYAML);
            await log(`Applying service YAML: ${serviceFilePath}`);

            const fileExists = await fs.pathExists(serviceFilePath);
            if (!fileExists) {
                await log(`Service YAML file does not exist: ${serviceFilePath}`);
                continue;
            }

            spinner.text = `Applying service YAML: ${serviceFilePath}`;
            // Execute the kubectl apply command
            await new Promise((resolve, reject) => {
                exec(`kubectl apply -f "${serviceFilePath}"`, async (error, stdout, stderr) => {
                    if (error) {
                        await log(`Error applying service YAML file ${serviceFilePath}: ${stderr}`);
                        spinner.fail(`Failed to apply service: ${stderr}`);
                        return reject(error);
                    }
                    await log(`Service YAML applied successfully: ${serviceFilePath}`);
                    await log(`Service applied: ${stdout}`);
                    spinner.succeed(`Service applied: ${serviceFilePath}`);
                    resolve();
                });
            });
        }

        // Wait for pods to become ready
        await waitForPodsReady();

        // After deployments and services are applied, check the status of pods and services
        await log('Checking the status of pods and services...');

        // Get pods status
        await new Promise((resolve, reject) => {
            exec('kubectl get pods', async (error, stdout, stderr) => {
                if (error) {
                    await log(`Error getting pods: ${stderr}`);
                    console.error(chalk.red('Error getting pods status.'));
                    return reject(error);
                }
                await log(`Pods status:\n${stdout}`);
                console.log(chalk.green('Pods status:'));
                console.log(stdout);

                // Optionally parse the stdout to check if the pods are running
                const lines = stdout.split('\n');
                let allPodsRunning = true;
                for (const line of lines.slice(1)) { // Skip the header line
                    if (line.trim() === '') continue;
                    const columns = line.split(/\s+/);
                    const podName = columns[0];
                    const podStatus = columns[2];
                    if (podStatus !== 'Running') {
                        allPodsRunning = false;
                        console.warn(chalk.yellow(`Pod ${podName} is in status ${podStatus}`));
                        await log(`Pod ${podName} is in status ${podStatus}`);
                    }
                }
                if (!allPodsRunning) {
                    console.warn(chalk.yellow('Warning: Not all pods are running.'));
                }
                resolve();
            });
        });

        // Get services status
        await new Promise((resolve, reject) => {
            exec('kubectl get services', async (error, stdout, stderr) => {
                if (error) {
                    await log(`Error getting services: ${stderr}`);
                    console.error(chalk.red('Error getting services status.'));
                    return reject(error);
                }
                await log(`Services status:\n${stdout}`);
                console.log(chalk.green('Services status:'));
                console.log(stdout);

                // Parse the stdout to find the port
                const lines = stdout.split('\n');
                let servicePort = null;
                for (const line of lines.slice(1)) { // Skip the header line
                    if (line.trim() === '') continue;
                    const columns = line.split(/\s+/);
                    const serviceName = columns[0];
                    if (serviceName === `${projectName}-service` || serviceName === 'web-service') {
                        const portInfo = columns[4]; // PORT(S) column
                        // portInfo might be like '80:32441/TCP'
                        const portMatch = portInfo.match(/:(\d+)\//);
                        if (portMatch) {
                            servicePort = portMatch[1];
                        }
                    }
                }
                if (servicePort) {
                    await log(`Service is exposed on port: ${servicePort}`);
                    console.log(chalk.green(`Your application is available at http://localhost:${servicePort}`));
                } else {
                    await log('Could not determine the service port.');
                    console.warn(chalk.yellow('Could not determine the service port.'));
                }
                resolve();
            });
        });

    } catch (err) {
        await log(`Failed to deploy on Kubernetes: ${err.stack}`);
        throw err;
    }
}

// Function to generate Nginx configuration file
async function generateNginxConfig(projectName) {
    const nginxConfig = `
server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

    await fs.writeFile(`${projectName}.conf`, nginxConfig.trim());
    await log('Generated Nginx configuration file.');
}

// Function to deploy Nginx configuration
async function deployNginxConfig(projectName) {
    try {
        await exec(`sudo cp ${projectName}.conf /etc/nginx/sites-available/`, (error, stdout, stderr) => {
            if (error) {
                log(`Error copying Nginx config: ${stderr}`);
                throw error;
            } else {
                log(`Nginx config copied: ${stdout}`);
                exec(`sudo ln -s /etc/nginx/sites-available/${projectName}.conf /etc/nginx/sites-enabled/`, (err, out, errout) => {
                    if (err) {
                        log(`Error creating symlink for Nginx config: ${errout}`);
                        throw err;
                    }
                    exec('sudo nginx -s reload', (reloadErr, reloadOut, reloadErrOut) => {
                        if (reloadErr) {
                            log(`Error reloading Nginx: ${reloadErrOut}`);
                            throw reloadErr;
                        }
                        log('Nginx configuration applied and server reloaded.');
                    });
                });
            }
        });
    } catch (err) {
        await log(`Failed to deploy Nginx configuration: ${err.message}`);
        throw err;
    }
}

// Main function to scan the project directory
async function scanProject(projectPath, projectName, imageTag) {
    await log(`Received projectName: ${projectName}, imageTag: ${imageTag}`);
    const spinner = ora('Starting the project scan...').start();

    try {
        await log(`Scanning directory: ${projectPath}`);

        const stats = await fs.stat(projectPath);
        if (!stats.isDirectory()) {
            spinner.fail(`Error: ${projectPath} is not a directory`);
            await log(`Provided path is not a directory: ${projectPath}`);
            return;
        }

        // Initialize the boolean flags
        let dockerFileFound = false;
        let packageJsonFound = false;

        // Scan the entire directory first
        const allFiles = await scanEntireDirectory(projectPath);
        for (const file of allFiles) {
            if (typeof file !== 'string') {
                continue;
            }
            if (file.toLowerCase().endsWith('dockerfile')) {
                dockerFileFound = true;
                console.log(chalk.green(`✔ Found Dockerfile: ${file}`));
                await log(`Found Dockerfile: ${file}`);
            } else if (file.endsWith('package.json')) {
                packageJsonFound = true;
                console.log(chalk.green(`✔ Found package.json: ${file}`));
                await log(`Found package.json: ${file}`);
            } else {
                console.log(`Found file: ${file}`);
                await log(`Found file: ${file}`);
            }
        }

        spinner.text = `Scanning project at ${projectPath}...`;

        if (packageJsonFound) {
            await log('Node.js project detected.');
            spinner.succeed('Detected a Node.js project');

            if (!dockerFileFound) {
                spinner.start('Generating Dockerfile for Node.js project...');
                await generateDockerfile('nodejs', projectPath);
                spinner.succeed('Dockerfile generated for Node.js project.');
            } else {
                spinner.succeed('Using existing Dockerfile.');
            }

            spinner.start('Building Docker image...');
            await buildDockerImage(projectPath, projectName, imageTag);
            spinner.succeed(`Docker image '${projectName}:${imageTag}' built successfully.`);
        } else {
            spinner.fail('Unable to determine the project type');
            await log('Failed to determine project type. No known configuration files found.');
        }

        spinner.succeed('Project scan and Docker image creation completed.');
    } catch (err) {
        await log('Error scanning project or building Docker image: ' + err.message);
        spinner.fail('Error scanning project or building Docker image');
        throw err;
    }
}

export { scanProject, deployDocker, deployKubernetes, deployNginxConfig };