# Base image
FROM openjdk:11-jdk

# Set the working directory
WORKDIR /app

# Copy the Maven project files
COPY pom.xml ./
COPY src ./src

# Package the application
RUN mvn package

# Expose the application port (default for Spring Boot)
EXPOSE 8080

# Start the application
CMD ["java", "-jar", "target/myapp.jar"]