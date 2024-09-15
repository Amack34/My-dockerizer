# Base image
FROM python:3.9

# Set the working directory
WORKDIR /app

# Copy and install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the application port (if applicable)
EXPOSE 5000

# Start the application (modify the command as per your app)
CMD ["python", "app.py"]