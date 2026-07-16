#pragma once
#include <string>
#include <vector>

namespace urlshortener {

class HashGenerator {
public:
    static const std::string BASE62_ALPHABET;
    static const uint64_t EPOCH = 1700000000000ULL;

    // Generate short code from a unique ID (snowflake-like)
    static std::string encodeBase62(uint64_t id);

    // Decode base62 back to ID
    static uint64_t decodeBase62(const std::string& code);

    // Generate unique ID using timestamp + machine_id + sequence
    static uint64_t generateUniqueId(uint16_t machineId);

    // Simple hash for consistent hashing ring
    static uint32_t hashString(const std::string& key);

private:
    static uint64_t sequence_;
    static uint64_t lastTimestamp_;
    static uint64_t waitNextMillis(uint64_t lastTimestamp);
};

} // namespace urlshortener
