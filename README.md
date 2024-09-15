This script automates the process of scanning a project directory, generating necessary Docker and Kubernetes configurations, building Docker images, and deploying applications to Docker, Kubernetes, or Nginx.

## **Table of Contents**

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage Instructions](#usage-instructions)
  - [1. Scanning the Project](#1-scanning-the-project)
  - [2. Building the Docker Image](#2-building-the-docker-image)
  - [3. Deploying the Application](#3-deploying-the-application)
    - [Deploying Locally with Docker](#deploying-locally-with-docker)
    - [Deploying to Kubernetes](#deploying-to-kubernetes)
    - [Deploying Nginx Configuration](#deploying-nginx-configuration)
- [Script Functions Overview](#script-functions-overview)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## **Prerequisites**

Before running the scripts, ensure that you have the following installed on your system:

- **Node.js** (version 14 or higher)
- **npm** (Node Package Manager)
- **Docker** (for building and running Docker images)
- **Kubernetes CLI** (`kubectl`) (for deploying to Kubernetes)
- **Nginx** (if deploying Nginx configurations)
- **Access Permissions**:
  - Ability to run Docker commands.
  - Permissions to execute `kubectl` commands.
  - `sudo` access for deploying Nginx configurations (if necessary).

## **Installation**

1. **Clone the Repository** (or download the script files):

   ```bash
   git clone https://github.com/yourusername/yourrepository.git
   cd yourrepository
   ```

2. **Install Dependencies**:

   Navigate to the directory containing your scripts and run:

   ```bash
   npm install
   ```

   This will install the required npm packages specified in the scripts:

   - `fs-extra`
   - `ora`
   - `xml2js`
   - `chalk`
   - `js-yaml`

   If these packages are not listed in a `package.json` file, you can install them individually:

   ```bash
   npm install fs-extra ora xml2js chalk js-yaml
   ```

## **Usage Instructions**

The scripts provide functionalities to scan a project, build Docker images, and deploy the application using various methods. Follow the steps below to use them effectively.

### **1. Scanning the Project**

The first step is to scan your project directory. This will analyze the project, detect its type (e.g., Node.js), and prepare for Docker image creation.

**Command**:

```bash
node src/cli.mjs scan /path/to/your/project
```

**Example**:

```bash
node src/cli.mjs scan ~/projects/my-nodejs-app/
```

### **2. Building the Docker Image**

After scanning, the script will attempt to build a Docker image for your project.

- If a `Dockerfile` is found in your project directory, it will use that.
- If not, the script will generate a `Dockerfile` based on the project type.

**During the Build Process**:

- The script uses `ora` spinners to show the progress.
- It logs detailed information about each step in `scan_project_log.txt`.

### **3. Deploying the Application**

After successfully building the Docker image, you can choose to deploy the application.

**Prompt**:

After the build process, the script will prompt:

```
Do you want to deploy the image? (yes/no):
```

**Choose Deployment Method**:

```
Deploy locally, remotely, to Kubernetes, or with Nginx? (local/remote/k8s/nginx):
```

#### **Deploying Locally with Docker**

If you choose to deploy locally:

- The script runs the Docker image locally, exposing it on the specified port.
- **Command**:

  ```bash
  docker run -d -p 8000:8000 your_image_name:tag
  ```

#### **Deploying to Kubernetes**

If you choose to deploy to Kubernetes:

1. **Ensure Kubernetes is Running**:

   - Make sure you have a running Kubernetes cluster.
   - For local development, you can use tools like Minikube or Docker Desktop's Kubernetes cluster.

2. **Deployment Process**:

   - The script updates Kubernetes deployment YAML files with the correct image tags.
   - It applies the deployment and service configurations using `kubectl apply`.
   - It uses `scanner.mjs` functions to automate these tasks.

3. **Waiting for Pods to Be Ready**:

   - The script waits for all pods to become ready, displaying status messages.
   - It checks the pods' status every few seconds and updates you on the progress.

4. **Accessing the Application**:

   - After successful deployment, the script retrieves the service's exposed port.
   - It provides a URL to access your application, e.g., `http://localhost:30001`.

#### **Deploying Nginx Configuration**

If you choose to deploy with Nginx:

- The script generates an Nginx configuration file.
- It copies the configuration to `/etc/nginx/sites-available/` and enables it.
- Reloads Nginx to apply the new configuration.

**Note**: You may need `sudo` permissions for Nginx deployment.

## **Script Functions Overview**

### **1. `cli.mjs`**

This is the command-line interface script that serves as the entry point for users. It allows you to interact with the deployment automation functions through the terminal.

**Features**:

- Parses command-line arguments to determine the action to perform (e.g., scan, deploy).
- Invokes functions from `scanner.mjs` based on user input.
- Provides prompts for user decisions during the deployment process.

### **2. `scanner.mjs`**

This script contains the core functions that perform the main tasks of the deployment process.

**Functions**:

- **`scanProject(projectPath, projectName, imageTag)`**:
  - Scans the project directory to detect the project type.
  - Builds a Docker image using the provided or generated `Dockerfile`.

- **`generateDockerfile(projectType, projectPath)`**:
  - Generates a `Dockerfile` if one does not exist, based on project analysis.

- **`buildDockerImage(projectPath, projectName, imageTag)`**:
  - Builds the Docker image using the `Dockerfile`.

- **`deployDocker(projectPath, projectName, imageTag)`**:
  - Deploys the Docker image locally or remotely.

- **`deployKubernetes(projectName, projectPath)`**:
  - Deploys the application to Kubernetes.
  - Applies configurations and waits for pods to become ready.

- **`waitForPodsReady(namespace, timeout)`**:
  - Waits for all pods in the specified namespace to become ready.

- **`deployNginxConfig(projectName)`**:
  - Generates and deploys Nginx configuration for the application.

- **Other Utility Functions**:
  - Parsing project files (`parsePomXml`, `parseGemfile`).
  - Scanning directories and files (`scanEntireDirectory`, `scanYAMLFiles`).
  - Logging and output formatting.

## **Troubleshooting**

- **Permissions Issues**:
  - Ensure you have the necessary permissions to run Docker and Kubernetes commands.
  - Use `sudo` if necessary, but be cautious with permissions.

- **Dependencies Not Found**:
  - Make sure all npm dependencies are installed.
  - Run `npm install` in the script directory.

- **Docker Build Failures**:
  - Check the `Dockerfile` for correctness.
  - Ensure the build context is correct and all necessary files are included.

- **Kubernetes Deployment Issues**:
  - Verify that your Kubernetes cluster is running.
  - Check the logs for pods if they are not starting (`kubectl logs pod_name`).

- **Accessing the Application**:
  - Ensure the port the service is exposed on is open and not blocked by firewall rules.
  - If using `NodePort`, the port will be a high-numbered port (e.g., 30000-32767).